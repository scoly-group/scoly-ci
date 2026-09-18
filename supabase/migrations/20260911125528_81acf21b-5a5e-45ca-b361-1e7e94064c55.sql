-- 1) Public school directory: expose only non-sensitive columns via the view,
--    and stop exposing the full schools table (incl. contact_name/phone/email) to anon/authenticated.
ALTER VIEW public.public_schools SET (security_invoker = false);

DROP POLICY IF EXISTS "Public can view approved schools" ON public.schools;

GRANT SELECT ON public.public_schools TO anon, authenticated;
REVOKE SELECT ON public.schools FROM anon;

-- 2) SECURITY DEFINER functions that are not meant to be called by clients
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_referent_detail(uuid, timestamptz, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_referents_overview(timestamptz, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_referral_balance(uuid) FROM anon, authenticated;
