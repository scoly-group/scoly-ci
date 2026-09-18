DROP POLICY IF EXISTS "Admins can manage all resources" ON public.resources;

DROP POLICY IF EXISTS "Delivery users can view very recent proofs" ON public.delivery_proofs;
CREATE POLICY "Delivery users can view proofs for active assignments"
ON public.delivery_proofs
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) = delivery_user_id
  AND created_at > (now() - interval '48 hours')
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = delivery_proofs.order_id
      AND o.delivery_user_id = (SELECT auth.uid())
  )
);