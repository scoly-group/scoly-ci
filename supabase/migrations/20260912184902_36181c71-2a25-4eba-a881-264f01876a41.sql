-- 1. Prevent direct API use of role-check helpers to probe other users' roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN current_user IN ('anon', 'authenticated') AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_module(_user_id uuid, _module text, _action text DEFAULT 'manage'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN current_user IN ('anon', 'authenticated') AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE public.has_role(_user_id, 'super_admin'::public.app_role)
      OR public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_permission(_user_id, _module, _action)
  END
$function$;

-- 2. Delivery proof files: make immutability explicit
DROP POLICY IF EXISTS "Delivery proof files cannot be updated" ON storage.objects;
CREATE POLICY "Delivery proof files cannot be updated"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (bucket_id <> 'delivery-proofs')
WITH CHECK (bucket_id <> 'delivery-proofs');

-- 3. Schools: explicit deny for anonymous visitors (contact columns included)
DROP POLICY IF EXISTS "Anon cannot read schools" ON public.schools;
CREATE POLICY "Anon cannot read schools"
ON public.schools
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- 4. Only super admins may grant privileged roles
DROP POLICY IF EXISTS "Admins insert roles (super_admin gated)" ON public.user_roles;
CREATE POLICY "Admins insert roles (super_admin gated)"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND (
    role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'moderator'::app_role, 'comptable'::app_role, 'commercial'::app_role)
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins update roles (super_admin gated)" ON public.user_roles;
CREATE POLICY "Admins update roles (super_admin gated)"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND (
    role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'moderator'::app_role, 'comptable'::app_role, 'commercial'::app_role)
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  )
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND (
    role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'moderator'::app_role, 'comptable'::app_role, 'commercial'::app_role)
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Admins delete roles (super_admin gated)" ON public.user_roles;
CREATE POLICY "Admins delete roles (super_admin gated)"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  AND (
    role NOT IN ('super_admin'::app_role, 'admin'::app_role, 'moderator'::app_role, 'comptable'::app_role, 'commercial'::app_role)
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  )
);

-- 5. Vendors cannot self-grant verification, commission rate or financial totals
CREATE OR REPLACE FUNCTION public.guard_vendor_settings_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean := false;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_is_staff := public.has_role(v_uid, 'admin'::public.app_role)
      OR public.has_role(v_uid, 'super_admin'::public.app_role);
  ELSE
    -- service role / backend operations
    v_is_staff := true;
  END IF;

  IF v_is_staff THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
    NEW.commission_rate := COALESCE((SELECT commission_rate FROM public.vendor_settings WHERE false), NULL);
    NEW.total_sales := 0;
    NEW.total_earnings := 0;
    NEW.pending_payout := 0;
    RETURN NEW;
  END IF;

  NEW.is_verified := OLD.is_verified;
  NEW.commission_rate := OLD.commission_rate;
  NEW.total_sales := OLD.total_sales;
  NEW.total_earnings := OLD.total_earnings;
  NEW.pending_payout := OLD.pending_payout;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_vendor_settings_privileged_fields ON public.vendor_settings;
CREATE TRIGGER trg_guard_vendor_settings_privileged_fields
BEFORE INSERT OR UPDATE ON public.vendor_settings
FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_settings_privileged_fields();