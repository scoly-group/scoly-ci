-- 1. Colonnes établissement -------------------------------------------------
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS sub_prefecture text,
  ADD COLUMN IF NOT EXISTS locality text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.schools
SET status = CASE WHEN is_active AND is_verified THEN 'approved'
                  WHEN is_active THEN 'pending'
                  ELSE 'disabled' END
WHERE status = 'approved' AND NOT (is_active AND is_verified);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_status_check') THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_status_check
      CHECK (status IN ('pending','approved','disabled','archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schools_status ON public.schools(status);

-- 2. Vue publique : uniquement les établissements validés et actifs ---------
DROP VIEW IF EXISTS public.public_schools;
CREATE VIEW public.public_schools
WITH (security_invoker = true) AS
SELECT id, name, code, logo_url, city, region, type, sub_prefecture, locality
FROM public.schools
WHERE is_active = true AND status = 'approved';

GRANT SELECT ON public.public_schools TO anon, authenticated;

-- Le public peut lire les établissements validés directement aussi
DROP POLICY IF EXISTS "Public can view approved schools" ON public.schools;
CREATE POLICY "Public can view approved schools"
ON public.schools FOR SELECT
USING (is_active = true AND status = 'approved');

-- Modération : gestion complète
DROP POLICY IF EXISTS "Moderators manage schools" ON public.schools;
CREATE POLICY "Moderators manage schools"
ON public.schools FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'moderator'))
WITH CHECK (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'moderator'));

-- Commerciaux : création (en attente) + lecture de leurs soumissions
DROP POLICY IF EXISTS "Commercials submit schools" ON public.schools;
CREATE POLICY "Commercials submit schools"
ON public.schools FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'commercial')
  AND created_by = auth.uid()
  AND status = 'pending'
);

DROP POLICY IF EXISTS "Commercials view their schools" ON public.schools;
CREATE POLICY "Commercials view their schools"
ON public.schools FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'commercial') AND created_by = auth.uid());

-- 3. Gérants d'établissement ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_managers TO authenticated;
GRANT ALL ON public.school_managers TO service_role;
ALTER TABLE public.school_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage school managers" ON public.school_managers;
CREATE POLICY "Staff manage school managers"
ON public.school_managers FOR ALL TO authenticated
USING (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator'))
WITH CHECK (has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator'));

DROP POLICY IF EXISTS "Managers view their memberships" ON public.school_managers;
CREATE POLICY "Managers view their memberships"
ON public.school_managers FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.grant_school_manager_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'referent')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.grant_school_manager_role() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_grant_school_manager_role ON public.school_managers;
CREATE TRIGGER trg_grant_school_manager_role
AFTER INSERT ON public.school_managers
FOR EACH ROW EXECUTE FUNCTION public.grant_school_manager_role();

CREATE OR REPLACE FUNCTION public.revoke_school_manager_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.school_managers WHERE user_id = OLD.user_id
  ) THEN
    DELETE FROM public.user_roles WHERE user_id = OLD.user_id AND role = 'referent';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_school_manager_role() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_revoke_school_manager_role ON public.school_managers;
CREATE TRIGGER trg_revoke_school_manager_role
AFTER DELETE ON public.school_managers
FOR EACH ROW EXECUTE FUNCTION public.revoke_school_manager_role();

DROP TRIGGER IF EXISTS trg_school_managers_updated ON public.school_managers;
CREATE TRIGGER trg_school_managers_updated
BEFORE UPDATE ON public.school_managers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Commissions établissement (2 % des kits vendus) ------------------------
CREATE TABLE IF NOT EXISTS public.school_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  kit_id uuid REFERENCES public.smart_kits(id) ON DELETE SET NULL,
  sale_amount numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0.02,
  commission_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_commissions_status_check CHECK (status IN ('pending','paid','cancelled'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_commissions TO authenticated;
GRANT ALL ON public.school_commissions TO service_role;
ALTER TABLE public.school_commissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_school_commissions_school ON public.school_commissions(school_id);

DROP POLICY IF EXISTS "Staff manage school commissions" ON public.school_commissions;
CREATE POLICY "Staff manage school commissions"
ON public.school_commissions FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'comptable')
)
WITH CHECK (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'comptable')
);

DROP POLICY IF EXISTS "Managers view their school commissions" ON public.school_commissions;
CREATE POLICY "Managers view their school commissions"
ON public.school_commissions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.school_managers m
  WHERE m.school_id = school_commissions.school_id AND m.user_id = auth.uid()
));

DROP TRIGGER IF EXISTS trg_school_commissions_updated ON public.school_commissions;
CREATE TRIGGER trg_school_commissions_updated
BEFORE UPDATE ON public.school_commissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_school_kit_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid;
BEGIN
  IF NEW.kit_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT school_id INTO v_school FROM public.smart_kits WHERE id = NEW.kit_id;
  IF v_school IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.school_commissions (
    school_id, order_id, order_item_id, kit_id,
    sale_amount, commission_rate, commission_amount
  ) VALUES (
    v_school, NEW.order_id, NEW.id, NEW.kit_id,
    NEW.total_price, 0.02, round(NEW.total_price * 0.02)
  );

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_school_kit_commission() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_create_school_kit_commission ON public.order_items;
CREATE TRIGGER trg_create_school_kit_commission
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.create_school_kit_commission();

-- 5. Demandes de retrait établissement --------------------------------------
CREATE TABLE IF NOT EXISTS public.school_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  validated_by uuid,
  validated_at timestamptz,
  paid_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_withdrawals_status_check CHECK (status IN ('pending','validated','paid','rejected')),
  CONSTRAINT school_withdrawals_amount_check CHECK (amount > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_withdrawals TO authenticated;
GRANT ALL ON public.school_withdrawals TO service_role;
ALTER TABLE public.school_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_school_withdrawals_school ON public.school_withdrawals(school_id);

DROP POLICY IF EXISTS "Staff manage school withdrawals" ON public.school_withdrawals;
CREATE POLICY "Staff manage school withdrawals"
ON public.school_withdrawals FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'comptable')
)
WITH CHECK (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'comptable')
);

DROP POLICY IF EXISTS "Managers view their school withdrawals" ON public.school_withdrawals;
CREATE POLICY "Managers view their school withdrawals"
ON public.school_withdrawals FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.school_managers m
  WHERE m.school_id = school_withdrawals.school_id AND m.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Managers request withdrawals" ON public.school_withdrawals;
CREATE POLICY "Managers request withdrawals"
ON public.school_withdrawals FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.school_managers m
    WHERE m.school_id = school_withdrawals.school_id AND m.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS trg_school_withdrawals_updated ON public.school_withdrawals;
CREATE TRIGGER trg_school_withdrawals_updated
BEFORE UPDATE ON public.school_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Solde établissement ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_school_balance(_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_earned numeric;
  v_withdrawn numeric;
  v_pending numeric;
BEGIN
  SELECT
    has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'comptable')
    OR EXISTS (SELECT 1 FROM public.school_managers m
               WHERE m.school_id = _school_id AND m.user_id = auth.uid())
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT COALESCE(SUM(commission_amount),0) INTO v_earned
  FROM public.school_commissions
  WHERE school_id = _school_id AND status <> 'cancelled';

  SELECT COALESCE(SUM(amount),0) INTO v_withdrawn
  FROM public.school_withdrawals
  WHERE school_id = _school_id AND status = 'paid';

  SELECT COALESCE(SUM(amount),0) INTO v_pending
  FROM public.school_withdrawals
  WHERE school_id = _school_id AND status IN ('pending','validated');

  RETURN jsonb_build_object(
    'earned', v_earned,
    'withdrawn', v_withdrawn,
    'pending', v_pending,
    'available', v_earned - v_withdrawn - v_pending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_balance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_school_balance(uuid) FROM anon;