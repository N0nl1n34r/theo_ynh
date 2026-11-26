-- Slim application administration. Admins can access feedback and account metadata,
-- never planning items through these functions. Infrastructure owners still have DB access.
CREATE TABLE public.theo_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.theo_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theo_admins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.theo_admins FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.theo_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.theo_admins a WHERE a.user_id = auth.uid()) $$;
REVOKE ALL ON FUNCTION public.theo_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.theo_is_admin() TO authenticated;

CREATE TABLE public.theo_feedback_review (
  feedback_id uuid PRIMARY KEY REFERENCES public.app_feedback(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'neu' CHECK (status IN ('neu','sortiert','geplant','erledigt')),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 3000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.theo_education_editorial (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object' AND octet_length(draft::text) <= 50000),
  published jsonb CHECK (published IS NULL OR (jsonb_typeof(published) = 'object' AND octet_length(published::text) <= 50000)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE TABLE public.theo_release_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'stable' CHECK (channel IN ('stable','early'))
);
CREATE TABLE public.theo_feature_flags (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  availability text NOT NULL CHECK (availability IN ('all','early','off'))
);
CREATE TABLE public.theo_feature_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.theo_feature_flags(key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  PRIMARY KEY (user_id, feature_key)
);
INSERT INTO public.theo_feature_flags (key, availability) VALUES ('authenticity','all');
ALTER TABLE public.theo_feedback_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theo_feedback_review FORCE ROW LEVEL SECURITY;
ALTER TABLE public.theo_education_editorial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theo_education_editorial FORCE ROW LEVEL SECURITY;
ALTER TABLE public.theo_release_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theo_release_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.theo_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theo_feature_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.theo_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theo_feature_overrides FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.theo_feedback_review, public.theo_education_editorial, public.theo_release_users, public.theo_feature_flags, public.theo_feature_overrides FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.theo_feature_access() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT COALESCE(jsonb_object_agg(f.key, COALESCE(o.enabled, f.availability='all' OR (f.availability='early' AND COALESCE(u.channel='early',false)))), '{}'::jsonb)
  FROM public.theo_feature_flags f
  LEFT JOIN public.theo_release_users u ON u.user_id=auth.uid()
  LEFT JOIN public.theo_feature_overrides o ON o.user_id=auth.uid() AND o.feature_key=f.key
  WHERE auth.uid() IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.theo_published_education() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT published FROM public.theo_education_editorial WHERE auth.uid() IS NOT NULL AND published IS NOT NULL ORDER BY id
$$;
CREATE OR REPLACE FUNCTION public.theo_admin_feedback() RETURNS TABLE(id uuid, category text, message text, page text, created_at timestamptz, status text, summary text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT f.id,f.category,f.message,f.page,f.created_at,COALESCE(r.status,'neu'),COALESCE(r.summary,'') FROM public.app_feedback f LEFT JOIN public.theo_feedback_review r ON r.feedback_id=f.id ORDER BY f.created_at DESC LIMIT 500;
END $$;
CREATE OR REPLACE FUNCTION public.theo_admin_review(p_id uuid,p_status text,p_summary text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('neu','sortiert','geplant','erledigt') OR p_summary IS NULL OR char_length(p_summary)>3000 THEN RAISE EXCEPTION 'Invalid review'; END IF;
  INSERT INTO public.theo_feedback_review(feedback_id,status,summary) VALUES(p_id,p_status,p_summary) ON CONFLICT (feedback_id) DO UPDATE SET status=EXCLUDED.status,summary=EXCLUDED.summary,updated_at=now();
END $$;
CREATE OR REPLACE FUNCTION public.theo_admin_articles() RETURNS TABLE(id text,draft jsonb,published jsonb,updated_at timestamptz,published_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT e.id,e.draft,e.published,e.updated_at,e.published_at FROM public.theo_education_editorial e ORDER BY e.id;
END $$;
CREATE OR REPLACE FUNCTION public.theo_admin_save_article(p_id text,p_doc jsonb,p_publish boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_id !~ '^[a-z0-9][a-z0-9-]{0,79}$' OR jsonb_typeof(p_doc) IS DISTINCT FROM 'object' OR p_doc->>'id' IS DISTINCT FROM p_id OR octet_length(p_doc::text)>50000 OR length(COALESCE(p_doc->>'title',''))=0 OR jsonb_typeof(p_doc->'paragraphs') IS DISTINCT FROM 'array' OR jsonb_typeof(p_doc->'sources') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid article'; END IF;
  INSERT INTO public.theo_education_editorial(id,draft,published,published_at) VALUES(p_id,p_doc,CASE WHEN p_publish THEN p_doc ELSE NULL END,CASE WHEN p_publish THEN now() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET draft=EXCLUDED.draft, published=CASE WHEN p_publish THEN EXCLUDED.draft ELSE public.theo_education_editorial.published END, published_at=CASE WHEN p_publish THEN now() ELSE public.theo_education_editorial.published_at END,updated_at=now();
END $$;
CREATE OR REPLACE FUNCTION public.theo_admin_users() RETURNS TABLE(user_id uuid,email text,created_at timestamptz,channel text,authenticity_override text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT u.id,u.email::text,u.created_at,COALESCE(r.channel,'stable'),CASE WHEN o.enabled IS TRUE THEN 'on' WHEN o.enabled IS FALSE THEN 'off' ELSE 'default' END FROM auth.users u LEFT JOIN public.theo_release_users r ON r.user_id=u.id LEFT JOIN public.theo_feature_overrides o ON o.user_id=u.id AND o.feature_key='authenticity' ORDER BY u.created_at DESC LIMIT 1000;
END $$;
CREATE OR REPLACE FUNCTION public.theo_admin_flags() RETURNS TABLE(key text,availability text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT f.key,f.availability FROM public.theo_feature_flags f ORDER BY f.key;
END $$;
CREATE OR REPLACE FUNCTION public.theo_admin_set_user(p_user uuid,p_channel text,p_override text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_channel NOT IN ('stable','early') OR p_override NOT IN ('default','on','off') THEN RAISE EXCEPTION 'Invalid settings'; END IF;
  INSERT INTO public.theo_release_users(user_id,channel) VALUES(p_user,p_channel) ON CONFLICT (user_id) DO UPDATE SET channel=EXCLUDED.channel;
  IF p_override='default' THEN DELETE FROM public.theo_feature_overrides WHERE user_id=p_user AND feature_key='authenticity';
  ELSE INSERT INTO public.theo_feature_overrides(user_id,feature_key,enabled) VALUES(p_user,'authenticity',p_override='on') ON CONFLICT (user_id,feature_key) DO UPDATE SET enabled=EXCLUDED.enabled; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.theo_admin_set_flag(p_key text,p_availability text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_availability NOT IN ('all','early','off') THEN RAISE EXCEPTION 'Invalid availability'; END IF;
  UPDATE public.theo_feature_flags SET availability=p_availability WHERE key=p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown feature'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.theo_feature_access(), public.theo_published_education(), public.theo_admin_feedback(), public.theo_admin_review(uuid,text,text), public.theo_admin_articles(), public.theo_admin_save_article(text,jsonb,boolean), public.theo_admin_users(), public.theo_admin_flags(), public.theo_admin_set_user(uuid,text,text), public.theo_admin_set_flag(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.theo_feature_access(), public.theo_published_education(), public.theo_admin_feedback(), public.theo_admin_review(uuid,text,text), public.theo_admin_articles(), public.theo_admin_save_article(text,jsonb,boolean), public.theo_admin_users(), public.theo_admin_flags(), public.theo_admin_set_user(uuid,text,text), public.theo_admin_set_flag(text,text) TO authenticated;
