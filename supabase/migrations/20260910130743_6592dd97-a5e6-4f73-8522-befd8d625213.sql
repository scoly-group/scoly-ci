-- 1) Views enforce the caller's permissions instead of the creator's
ALTER VIEW public.public_schools SET (security_invoker = true);
ALTER VIEW public.schools_public SET (security_invoker = true);

-- 2) schools: public columns only, contact details stay private
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.schools FROM anon;
REVOKE SELECT ON public.schools FROM authenticated;
GRANT SELECT (
  id, name, code, type, city, region, address, website, logo_url,
  is_verified, is_active, student_count, status, sub_prefecture, locality,
  created_by, created_at, updated_at
) ON public.schools TO anon, authenticated;

DROP POLICY IF EXISTS "Public can view approved schools" ON public.schools;
CREATE POLICY "Public can view approved schools"
ON public.schools FOR SELECT TO anon, authenticated
USING (is_active = true AND (status = 'approved' OR is_verified = true));

-- 3) Contact details for staff / owners / school managers only
CREATE OR REPLACE FUNCTION public.list_manageable_schools()
RETURNS TABLE (
  id uuid, name text, code text, type text, status text, is_active boolean,
  sub_prefecture text, locality text, city text, region text, logo_url text,
  contact_name text, contact_phone text, contact_email text,
  created_by uuid, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.id, s.name, s.code, s.type, s.status, s.is_active,
         s.sub_prefecture, s.locality, s.city, s.region, s.logo_url,
         s.contact_name, s.contact_phone, s.contact_email,
         s.created_by, s.created_at
  FROM public.schools s
  WHERE auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'moderator'::public.app_role)
      OR s.admin_user_id = auth.uid()
      OR (public.has_role(auth.uid(), 'commercial'::public.app_role) AND s.created_by = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.school_managers sm
        WHERE sm.school_id = s.id AND sm.user_id = auth.uid()
      )
    )
  ORDER BY s.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.list_manageable_schools() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_manageable_schools() TO authenticated;

-- 4) Self-registration can no longer create a pre-approved establishment
DROP POLICY IF EXISTS "Users can register their own school" ON public.schools;
CREATE POLICY "Users can register their own school"
ON public.schools FOR INSERT TO authenticated
WITH CHECK (
  coalesce(status, 'pending') = 'pending'
  AND coalesce(is_verified, false) = false
  AND coalesce(is_active, false) = false
  AND approved_by IS NULL
  AND approved_at IS NULL
);

DROP POLICY IF EXISTS "Commercials submit schools" ON public.schools;
CREATE POLICY "Commercials submit schools"
ON public.schools FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'commercial'::public.app_role)
  AND created_by = auth.uid()
  AND coalesce(status, 'pending') = 'pending'
  AND coalesce(is_verified, false) = false
  AND approved_by IS NULL
  AND approved_at IS NULL
);

-- 5) SECURITY DEFINER functions: no direct API execution when not intended
REVOKE EXECUTE ON FUNCTION public.can_manage_module(uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_article_content(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_school_contact(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_login_session(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_order_receipt(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_mark_picked_up(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delivery_submit_handoff(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_admin_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_referent_detail(uuid, timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_referents_overview(timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_traffic_overview(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_share_stats(timestamptz, timestamptz) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_provider_quota_status() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_email_provider_daily_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_delivery_orders(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_delivery_stats(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_school_balance(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_referral_balance(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_loyalty_points() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_educational_content_file_url(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_resource_file_url(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_article_premium_content(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_article_share(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) FROM anon, PUBLIC;