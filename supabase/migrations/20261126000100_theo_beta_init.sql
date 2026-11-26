-- Theo Beta — Initiales Datenbankschema, Trigger, LWW-Sync-RPC & Row Level Security
-- Zielregion: Frankfurt (eu-central-1)
-- Meilensteine: M1 (Warteliste), M2 (Auth & Invite-Codes), M3 (Items LWW Sync), M4 (Self-Service Löschung), M5 (Bestandsschutz & Zahlung)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================================
-- 1. PROFILES (1:1 zu auth.users, Bestandsschutz ab Tag 1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  segment text CHECK (segment IS NULL OR char_length(segment) <= 120),
  price_locked numeric NOT NULL DEFAULT 29 CHECK (price_locked > 0),
  price_locked_at timestamptz NOT NULL DEFAULT now(),
  invite_code text,
  welcome_sent_at timestamptz,
  onboarding_done boolean NOT NULL DEFAULT false,
  -- M4: Zweistufige Konto-Löschung per Bestätigungs-Link
  delete_token_hash text,
  delete_requested_at timestamptz,
  -- M5: Zahlung / Stripe / §312k BGB Kündigungsvormerkung
  plan_interval text CHECK (plan_interval IS NULL OR plan_interval IN ('month', 'year', 'pilot')),
  subscription_status text NOT NULL DEFAULT 'beta_free'
    CHECK (subscription_status IN ('beta_free', 'active', 'cancel_at_period_end', 'canceled', 'past_due')),
  paid_until timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  withdrawal_until timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Schutz-Trigger: Authentifizierte Clients dürfen nur harmlose eigene Felder (segment, onboarding_done)
-- direkt ändern; Preisbindung (price_locked) und Zahlungsfelder darf nur service_role ändern.
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.price_locked := 29;
      NEW.price_locked_at := now();
      NEW.subscription_status := 'beta_free';
      NEW.paid_until := NULL;
      NEW.cancel_at_period_end := false;
      NEW.canceled_at := NULL;
      NEW.stripe_customer_id := NULL;
      NEW.stripe_subscription_id := NULL;
      NEW.delete_token_hash := NULL;
      NEW.delete_requested_at := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.user_id := OLD.user_id;
      NEW.price_locked := OLD.price_locked;
      NEW.price_locked_at := OLD.price_locked_at;
      NEW.invite_code := OLD.invite_code;
      NEW.welcome_sent_at := OLD.welcome_sent_at;
      NEW.plan_interval := OLD.plan_interval;
      NEW.subscription_status := OLD.subscription_status;
      NEW.paid_until := OLD.paid_until;
      NEW.cancel_at_period_end := OLD.cancel_at_period_end;
      NEW.canceled_at := OLD.canceled_at;
      NEW.withdrawal_until := OLD.withdrawal_until;
      NEW.stripe_customer_id := OLD.stripe_customer_id;
      NEW.stripe_subscription_id := OLD.stripe_subscription_id;
      NEW.delete_token_hash := OLD.delete_token_hash;
      NEW.delete_requested_at := OLD.delete_requested_at;
      NEW.created_at := OLD.created_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_columns();

-- Automatische Profil-Anlage bei neuem auth.users-Eintrag (inkl. Segment-Übernahme aus Warteliste)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segment text;
  v_invite text;
BEGIN
  v_segment := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'segment', '')), '');
  v_invite  := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'invite_code', '')), '');

  IF v_segment IS NULL AND NEW.email IS NOT NULL THEN
    SELECT w.segment INTO v_segment
    FROM public.waitlist w
    WHERE w.email = NEW.email::citext
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (user_id, segment, price_locked, price_locked_at, invite_code)
  VALUES (NEW.id, v_segment, 29, now(), v_invite)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================================
-- 2. ITEMS (ersetzt CalDAV-Objekte; Pro-Row-LWW + Tombstones)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uid text NOT NULL CHECK (char_length(uid) BETWEEN 3 AND 255),
  kind text NOT NULL CHECK (kind IN ('block', 'appt', 'mit', 'todo', 'phase', 'capsule', 'meta')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_items_user_synced ON public.items (user_id, synced_at);
CREATE INDEX IF NOT EXISTS idx_items_user_updated ON public.items (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_items_user_kind ON public.items (user_id, kind) WHERE deleted = false;

CREATE OR REPLACE FUNCTION public.touch_items_synced_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.synced_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_synced_at ON public.items;
CREATE TRIGGER trg_items_synced_at
  BEFORE INSERT OR UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_items_synced_at();

-- Pro-Row-LWW Batch-Upsert unter RLS (SECURITY INVOKER -> auth.uid() greift strikt)
CREATE OR REPLACE FUNCTION public.upsert_user_items(p_items jsonb)
RETURNS SETOF public.items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  INSERT INTO public.items (user_id, uid, kind, payload, updated_at, deleted)
  SELECT
    auth.uid(),
    (elem->>'uid')::text,
    (elem->>'kind')::text,
    COALESCE(elem->'payload', '{}'::jsonb),
    COALESCE((elem->>'updated_at')::timestamptz, now()),
    COALESCE((elem->>'deleted')::boolean, false)
  FROM jsonb_array_elements(p_items) AS elem
  WHERE elem->>'uid' IS NOT NULL
    AND elem->>'kind' IS NOT NULL
  ON CONFLICT (user_id, uid) DO UPDATE
    SET kind       = EXCLUDED.kind,
        payload    = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at,
        deleted    = EXCLUDED.deleted
    WHERE EXCLUDED.updated_at >= public.items.updated_at
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_items(jsonb) TO authenticated;

-- ============================================================================
-- 3. WAITLIST (Double Opt-in, Segment optional, kein öffentliches Auslesen)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE CHECK (
    char_length(email::text) BETWEEN 5 AND 254
    AND email::text ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  segment text CHECK (
    segment IS NULL OR segment IN (
      'frisch_diagnostiziert',
      'verdacht_warteliste',
      'keine_diagnose',
      'keine_angabe'
    )
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  token text,
  unsubscribe_token text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. INVITE CODES (Geschlossene Beta, nur service_role)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invite_codes (
  code text PRIMARY KEY CHECK (char_length(code) BETWEEN 4 AND 64),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  used integer NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= max_uses),
  note text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Atomare Einlösung eines Invite-Codes (nur für service_role freigegeben)
CREATE OR REPLACE FUNCTION public.claim_invite_code(p_code text)
RETURNS TABLE(code text, max_uses integer, used integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.invite_codes ic
  SET used = ic.used + 1
  WHERE upper(trim(ic.code)) = upper(trim(p_code))
    AND ic.used < ic.max_uses
    AND (ic.expires_at IS NULL OR ic.expires_at > now())
  RETURNING ic.code, ic.max_uses, ic.used;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invite_code(text) TO service_role;

-- ============================================================================
-- 5. RATE LIMITS (Datensparsam per Hash, nur service_role, kein Drittanbieter)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket_key text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_max_hits integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits integer;
BEGIN
  -- Gelegentliches Aufräumen abgelaufener Einträge
  DELETE FROM public.rate_limits WHERE reset_at < now() - interval '1 hour';

  INSERT INTO public.rate_limits (bucket_key, hits, reset_at)
  VALUES (p_bucket_key, 1, now() + make_interval(secs => GREATEST(1, p_window_seconds)))
  ON CONFLICT (bucket_key) DO UPDATE
    SET hits = CASE
                 WHEN public.rate_limits.reset_at <= now() THEN 1
                 ELSE public.rate_limits.hits + 1
               END,
        reset_at = CASE
                     WHEN public.rate_limits.reset_at <= now()
                       THEN now() + make_interval(secs => GREATEST(1, p_window_seconds))
                     ELSE public.rate_limits.reset_at
                   END
  RETURNING hits INTO v_hits;

  RETURN v_hits <= p_max_hits;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (PFLICHT AUF ALLEN TABELLEN)
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;

-- Profiles: strikt nur eigene Zeile für eingeloggte Nutzer:in
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Items: strikt nur eigene Einträge für eingeloggte Nutzer:in
DROP POLICY IF EXISTS items_select_own ON public.items;
CREATE POLICY items_select_own ON public.items
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS items_insert_own ON public.items;
CREATE POLICY items_insert_own ON public.items
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS items_update_own ON public.items;
CREATE POLICY items_update_own ON public.items
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS items_delete_own ON public.items;
CREATE POLICY items_delete_own ON public.items
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Waitlist: anon darf ausschließlich validierte pending-Zeilen einfügen;
-- Lesen/Aktualisieren/Löschen ausschließlich über service_role (kein Adress-Leaking).
DROP POLICY IF EXISTS waitlist_insert_anon ON public.waitlist;
CREATE POLICY waitlist_insert_anon ON public.waitlist
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'
    AND confirmed_at IS NULL
    AND email IS NOT NULL
    AND char_length(email::text) BETWEEN 5 AND 254
  );

-- Invite-Codes & Rate-Limits: keinerlei Policies für anon/authenticated -> nur service_role!

-- Explizite Tabellen-Privilegien bereinigen
REVOKE ALL ON public.invite_codes FROM anon, authenticated;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
REVOKE SELECT, UPDATE, DELETE ON public.waitlist FROM anon, authenticated;
GRANT INSERT (email, segment, status) ON public.waitlist TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;

-- Initialen Pilot-Einladungscode anlegen (für sofortigen Beta-Test durch Auftraggeber)
INSERT INTO public.invite_codes (code, max_uses, used, note)
VALUES ('THEO-BETA-2026', 25, 0, 'Initialer Beta-Einladungscode für Pilot-Testende')
ON CONFLICT (code) DO NOTHING;
