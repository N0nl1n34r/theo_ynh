-- Private, account-linked feedback. No public GitHub issue or automated agent invocation.
CREATE TABLE IF NOT EXISTS public.app_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('feedback', 'bug', 'idea')),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 10 AND 3000),
  page text NOT NULL DEFAULT '' CHECK (char_length(page) <= 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_feedback FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_feedback FROM PUBLIC, anon, authenticated;
GRANT INSERT (user_id, category, message, page) ON public.app_feedback TO authenticated;
GRANT SELECT, DELETE ON public.app_feedback TO authenticated;
CREATE POLICY feedback_insert_own ON public.app_feedback FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY feedback_select_own ON public.app_feedback FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY feedback_delete_own ON public.app_feedback FOR DELETE TO authenticated USING (user_id = auth.uid());
