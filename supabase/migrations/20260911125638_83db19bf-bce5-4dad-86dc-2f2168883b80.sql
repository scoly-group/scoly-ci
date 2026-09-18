-- Revert the definer view (linter 0010) and instead hide contact columns at the privilege level.
ALTER VIEW public.public_schools SET (security_invoker = true);

-- Restore row visibility of approved/active schools, but only for non-sensitive columns.
DROP POLICY IF EXISTS "Public can view approved schools" ON public.schools;
CREATE POLICY "Public can view approved schools"
ON public.schools
FOR SELECT
TO anon, authenticated
USING (is_active = true AND (status = 'approved' OR is_verified = true));

-- Column-level SELECT privileges: contact_name / contact_phone / contact_email excluded.
-- Staff, owners and school managers read those through public.list_manageable_schools()
-- and public.get_school_contact() (SECURITY DEFINER).
REVOKE SELECT ON public.schools FROM anon, authenticated;
GRANT SELECT (
  id, name, code, type, city, region, address, phone, email, website, logo_url,
  admin_user_id, is_verified, is_active, student_count, created_at, updated_at,
  status, sub_prefecture, locality, created_by, approved_by, approved_at
) ON public.schools TO anon, authenticated;
