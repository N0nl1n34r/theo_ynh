-- Generic per-user rollout: future features are registered by their implementation.
CREATE OR REPLACE FUNCTION public.theo_admin_user_overrides()
RETURNS TABLE(user_id uuid, feature_key text, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT o.user_id,o.feature_key,o.enabled FROM public.theo_feature_overrides o;
END $$;
CREATE OR REPLACE FUNCTION public.theo_admin_update_user(p_user uuid,p_channel text,p_overrides jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE entry record;
BEGIN
  IF NOT public.theo_is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_channel NOT IN ('stable','early') OR jsonb_typeof(p_overrides) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid settings'; END IF;
  INSERT INTO public.theo_release_users(user_id,channel) VALUES(p_user,p_channel) ON CONFLICT (user_id) DO UPDATE SET channel=EXCLUDED.channel;
  FOR entry IN SELECT * FROM jsonb_each_text(p_overrides) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.theo_feature_flags f WHERE f.key=entry.key) OR entry.value NOT IN ('default','on','off') THEN RAISE EXCEPTION 'Invalid feature override'; END IF;
    IF entry.value='default' THEN DELETE FROM public.theo_feature_overrides o WHERE o.user_id=p_user AND o.feature_key=entry.key;
    ELSE INSERT INTO public.theo_feature_overrides(user_id,feature_key,enabled) VALUES(p_user,entry.key,entry.value='on') ON CONFLICT (user_id,feature_key) DO UPDATE SET enabled=EXCLUDED.enabled; END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.theo_admin_user_overrides(),public.theo_admin_update_user(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.theo_admin_user_overrides(),public.theo_admin_update_user(uuid,text,jsonb) TO authenticated;
