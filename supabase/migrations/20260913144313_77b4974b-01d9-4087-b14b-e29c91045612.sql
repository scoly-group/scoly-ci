CREATE OR REPLACE FUNCTION public.create_school_kit_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school uuid;
  v_amount numeric;
BEGIN
  IF NEW.kit_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT school_id INTO v_school FROM public.smart_kits WHERE id = NEW.kit_id;
  IF v_school IS NULL THEN
    RETURN NEW;
  END IF;

  -- Commission forfaitaire : 500 FCFA par kit vendu.
  v_amount := 500 * GREATEST(COALESCE(NEW.quantity, 1), 1);

  INSERT INTO public.school_commissions (
    school_id, order_id, order_item_id, kit_id,
    sale_amount, commission_rate, commission_amount
  ) VALUES (
    v_school, NEW.order_id, NEW.id, NEW.kit_id,
    NEW.total_price, 0, v_amount
  );

  RETURN NEW;
END;
$$;