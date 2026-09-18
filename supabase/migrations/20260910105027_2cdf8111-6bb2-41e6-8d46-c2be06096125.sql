-- 1) Remove blanket public read of the schools table (leaked contact columns)
DROP POLICY IF EXISTS "Public can view approved schools" ON public.schools;

-- Public listings keep working through the curated views (no contact columns)
ALTER VIEW public.public_schools SET (security_invoker = false);
ALTER VIEW public.schools_public SET (security_invoker = false);
GRANT SELECT ON public.public_schools TO anon, authenticated;
GRANT SELECT ON public.schools_public TO anon, authenticated;

-- School managers still need the full record of their own school
CREATE POLICY "School managers can view their school"
ON public.schools
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.school_managers sm
    WHERE sm.school_id = schools.id AND sm.user_id = auth.uid()
  )
);

-- 2) Internal trigger guards must not be callable through the API
REVOKE EXECUTE ON FUNCTION public.guard_article_purchase_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_coupon_redemption_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_loyalty_reward_update() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_referent_application_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_referral_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.guard_withdrawal_request_insert() FROM anon, authenticated, public;