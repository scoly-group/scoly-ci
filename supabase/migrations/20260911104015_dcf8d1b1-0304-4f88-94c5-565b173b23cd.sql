DROP POLICY IF EXISTS "Public can view approved schools" ON public.schools;

ALTER VIEW public.public_schools SET (security_invoker = false);
GRANT SELECT ON public.public_schools TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_admin_stats() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_school_contact(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_resource_file_url(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_module(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_school_contact(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_resource_file_url(uuid) TO service_role;