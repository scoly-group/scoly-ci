REVOKE EXECUTE ON FUNCTION public.get_school_contact(uuid) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_contact(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_email_provider_daily_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_provider_quota_status() FROM anon, PUBLIC;