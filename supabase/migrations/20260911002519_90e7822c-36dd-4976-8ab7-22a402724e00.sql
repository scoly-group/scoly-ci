-- Private delivery-proof objects: uploader and administrators only.
CREATE POLICY "Delivery users upload own proof files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Delivery users read own proof files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-proofs'
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

CREATE POLICY "Delivery users delete own proof files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'delivery-proofs'
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

-- Replace the broad commercial-availability policy with explicit operations.
DROP POLICY IF EXISTS "Own availability view" ON public.commercial_availability;
DROP POLICY IF EXISTS "Staff manage availability" ON public.commercial_availability;

CREATE POLICY "Availability visible to owner or zone staff"
ON public.commercial_availability
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_module(auth.uid(), 'zones', 'manage')
);

CREATE POLICY "Zone staff create availability"
ON public.commercial_availability
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_module(auth.uid(), 'zones', 'manage')
  AND (created_by IS NULL OR created_by = auth.uid())
);

CREATE POLICY "Owner or zone staff update availability"
ON public.commercial_availability
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_module(auth.uid(), 'zones', 'manage')
)
WITH CHECK (
  user_id = auth.uid()
  OR public.can_manage_module(auth.uid(), 'zones', 'manage')
);

CREATE POLICY "Owner or zone staff delete availability"
ON public.commercial_availability
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_manage_module(auth.uid(), 'zones', 'manage')
);

-- Consolidate vendor settings without mixed permissive/restrictive overlap.
DROP POLICY IF EXISTS "Admins can manage all vendor settings" ON public.vendor_settings;
DROP POLICY IF EXISTS "Admins can view full vendor details" ON public.vendor_settings;
DROP POLICY IF EXISTS "Block anon access to vendor_settings" ON public.vendor_settings;
DROP POLICY IF EXISTS "Vendor settings owner or admin only" ON public.vendor_settings;
DROP POLICY IF EXISTS "Vendors can manage their settings" ON public.vendor_settings;

CREATE POLICY "Vendors read own settings"
ON public.vendor_settings
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Vendors create own settings"
ON public.vendor_settings
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Vendors update own settings"
ON public.vendor_settings
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "Vendors delete own settings"
ON public.vendor_settings
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Remove direct API execution from SECURITY DEFINER routines that are internal,
-- trigger-only, service-only, or otherwise not called by the browser application.
REVOKE EXECUTE ON FUNCTION public.can_manage_module(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_commercial() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_classify_product_category() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_confirm_newsletter_subscriber(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_confirm_order_on_payment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_admin_action() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_data() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_login_sessions() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_view_tracking() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_coupon_discount(text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_school_kit_commission() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_stock_on_order() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_article_publish_moderation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_newsletter_public_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_order_item_price() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_payment_retention_window() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_campaign_email_log(uuid, text, text, text, text, text, text, boolean, integer, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_email_log(uuid, text, text, text, text, boolean, integer, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.force_logout_user(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_email_provider_stat(text, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_service_request() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_article_published() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_order_status_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_payment_status_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_server_total(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_available_commercial(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_change() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_order_total() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_email_log(text, text, text, text, uuid, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_article_premium_content() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_educational_content_file() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_smart_kit_total() FROM anon, authenticated;