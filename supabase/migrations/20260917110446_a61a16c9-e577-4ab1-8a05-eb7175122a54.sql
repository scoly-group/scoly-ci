ALTER TABLE public.school_managers
  ADD COLUMN IF NOT EXISTS is_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.school_managers SET is_approved = true, approved_at = COALESCE(approved_at, created_at) WHERE is_approved = false;

DROP POLICY IF EXISTS "Users can request their own establishment membership" ON public.school_managers;
CREATE POLICY "Users can request their own establishment membership"
ON public.school_managers
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND is_approved = false);

DROP POLICY IF EXISTS "Users can read their own establishment membership" ON public.school_managers;
CREATE POLICY "Users can read their own establishment membership"
ON public.school_managers
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'moderator'));

GRANT SELECT, INSERT ON public.school_managers TO authenticated;
GRANT ALL ON public.school_managers TO service_role;