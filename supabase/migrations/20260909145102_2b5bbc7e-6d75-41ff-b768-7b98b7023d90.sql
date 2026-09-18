-- 1) Restrict paid educational content: authenticated users may only browse
-- approved FREE content; paid content stays visible to authors/admins only
-- (existing dedicated policies), so file_url/preview_url of paid items are hidden.
DROP POLICY IF EXISTS "Authenticated can browse approved content" ON public.educational_content;

CREATE POLICY "Authenticated can browse approved free content"
ON public.educational_content
FOR SELECT
TO authenticated
USING (
  is_approved = true
  AND (
    is_free = true
    OR author_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
    OR public.has_role((SELECT auth.uid()), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.article_purchases ap
      WHERE ap.article_id = educational_content.id
        AND ap.user_id = (SELECT auth.uid())
        AND ap.status = 'completed'
    )
  )
);

-- 2) Trigger-only SECURITY DEFINER functions must not be callable via the API.
REVOKE EXECUTE ON FUNCTION public.guard_article_purchase_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_coupon_redemption_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_loyalty_reward_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_referent_application_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_referral_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_schools_write() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_withdrawal_request_insert() FROM anon, authenticated;
