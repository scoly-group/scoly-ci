DROP POLICY IF EXISTS "Staff can update order workflow" ON public.orders;
CREATE POLICY "Staff can update order workflow"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'moderator'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'moderator'::public.app_role)
);