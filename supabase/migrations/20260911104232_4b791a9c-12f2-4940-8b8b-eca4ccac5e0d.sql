-- Revert to a normal (invoker) view: no SECURITY DEFINER view.
ALTER VIEW public.public_schools SET (security_invoker = true);

-- Restore the public read policy on approved schools...
DROP POLICY IF EXISTS "Public can view approved schools" ON public.schools;
CREATE POLICY "Public can view approved schools"
ON public.schools FOR SELECT TO anon, authenticated
USING (is_active = true AND (status = 'approved' OR is_verified = true));

-- ...but enforce column-level read privileges so contact details are never
-- selectable from the table by anon/authenticated. Staff/owners read them
-- through the secured functions (list_manageable_schools, get_school_contact).
REVOKE SELECT ON public.schools FROM anon, authenticated;

GRANT SELECT (id, name, code, type, city, region, website, logo_url,
              is_verified, is_active, student_count, status,
              sub_prefecture, locality, created_at, updated_at)
ON public.schools TO anon;

GRANT SELECT (id, name, code, type, city, region, website, logo_url,
              is_verified, is_active, student_count, status,
              sub_prefecture, locality, created_at, updated_at,
              admin_user_id, created_by, approved_by, approved_at)
ON public.schools TO authenticated;

GRANT ALL ON public.schools TO service_role;

-- Staff/owner contact lookup stays available to signed-in users
-- (the function performs its own role/ownership checks).
GRANT EXECUTE ON FUNCTION public.get_school_contact(uuid) TO authenticated;