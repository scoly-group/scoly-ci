-- 1. Les comptes « admin » deviennent « moderator »
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT ur.user_id, 'moderator'::public.app_role
FROM public.user_roles ur
WHERE ur.role = 'admin'::public.app_role
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles WHERE role = 'admin'::public.app_role;

-- 2. Le rôle « admin » ne peut plus être attribué
CREATE OR REPLACE FUNCTION public.block_admin_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin'::public.app_role THEN
    RAISE EXCEPTION 'Le rôle Administrateur a été supprimé. Utilisez Modérateur.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_admin_role_assignment ON public.user_roles;
CREATE TRIGGER block_admin_role_assignment
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.block_admin_role_assignment();

-- 3. Le modérateur hérite des droits de l'ancien administrateur
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN current_user IN ('anon', 'authenticated') AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND (
          ur.role = _role
          OR (_role = 'admin'::public.app_role AND ur.role IN ('moderator'::public.app_role, 'super_admin'::public.app_role))
          OR (_role = 'moderator'::public.app_role AND ur.role = 'super_admin'::public.app_role)
        )
    )
  END
$$;

-- 4. Gestion des rôles : super administrateur uniquement
DROP POLICY IF EXISTS "Admins insert roles (super_admin gated)" ON public.user_roles;
DROP POLICY IF EXISTS "Admins update roles (super_admin gated)" ON public.user_roles;
DROP POLICY IF EXISTS "Admins delete roles (super_admin gated)" ON public.user_roles;

CREATE POLICY "Super admins insert roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role));

CREATE POLICY "Super admins update roles" ON public.user_roles
FOR UPDATE TO authenticated
USING (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role));

CREATE POLICY "Super admins delete roles" ON public.user_roles
FOR DELETE TO authenticated
USING (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role));

-- 5. Retraits : super administrateur + comptable
DROP POLICY IF EXISTS "Admin manage withdrawals" ON public.withdrawal_requests;
CREATE POLICY "Super admins and accountants manage withdrawals" ON public.withdrawal_requests
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'comptable'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'comptable'::public.app_role)
);

DROP POLICY IF EXISTS "Staff manage school withdrawals" ON public.school_withdrawals;
CREATE POLICY "Super admins and accountants manage school withdrawals" ON public.school_withdrawals
FOR ALL TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'comptable'::public.app_role)
)
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  OR public.has_role((SELECT auth.uid()), 'comptable'::public.app_role)
);

-- 6. Réglages de la plateforme : super administrateur uniquement
DROP POLICY IF EXISTS "Admins can manage platform settings" ON public.platform_settings;
DROP POLICY IF EXISTS "Only admins can view platform settings" ON public.platform_settings;

CREATE POLICY "Super admins manage platform settings" ON public.platform_settings
FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role));

CREATE POLICY "Staff view platform settings" ON public.platform_settings
FOR SELECT TO authenticated
USING (public.has_role((SELECT auth.uid()), 'moderator'::public.app_role));

-- 7. Permissions par rôle : l'entrée « admin » n'a plus lieu d'être
DELETE FROM public.role_permissions WHERE role = 'admin'::public.app_role;