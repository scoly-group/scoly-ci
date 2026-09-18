
-- 1) Réglage de marge
INSERT INTO public.platform_settings (key, value, description)
VALUES ('price_markup_percent', '4', 'Marge interne (%) ajoutée automatiquement aux prix publics pour absorber les frais d''encaissement')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_price_markup()
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT NULLIF(ps.value,'')::numeric FROM public.platform_settings ps WHERE ps.key = 'price_markup_percent'), 4);
$$;

CREATE OR REPLACE FUNCTION public.apply_price_markup(_base numeric)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN _base IS NULL THEN NULL ELSE round(_base * (1 + public.current_price_markup() / 100)) END;
$$;

-- 2) Colonnes de prix de base
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_price numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_original_price numeric;
ALTER TABLE public.smart_kits ADD COLUMN IF NOT EXISTS base_total_price numeric;
ALTER TABLE public.smart_kits ADD COLUMN IF NOT EXISTS base_discount_price numeric;
ALTER TABLE public.smart_kit_items ADD COLUMN IF NOT EXISTS base_estimated_price numeric;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS base_price numeric;
ALTER TABLE public.educational_content ADD COLUMN IF NOT EXISTS base_price numeric;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS base_price numeric;

-- 3) Déclencheurs
CREATE OR REPLACE FUNCTION public.markup_products()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.base_price := COALESCE(NEW.base_price, NEW.price);
    NEW.price := public.apply_price_markup(NEW.base_price);
    NEW.base_original_price := COALESCE(NEW.base_original_price, NEW.original_price);
    NEW.original_price := public.apply_price_markup(NEW.base_original_price);
  ELSE
    IF NEW.base_price IS DISTINCT FROM OLD.base_price THEN
      NEW.price := public.apply_price_markup(NEW.base_price);
    ELSIF NEW.price IS DISTINCT FROM OLD.price THEN
      NEW.base_price := NEW.price;
      NEW.price := public.apply_price_markup(NEW.price);
    END IF;
    IF NEW.base_original_price IS DISTINCT FROM OLD.base_original_price THEN
      NEW.original_price := public.apply_price_markup(NEW.base_original_price);
    ELSIF NEW.original_price IS DISTINCT FROM OLD.original_price THEN
      NEW.base_original_price := NEW.original_price;
      NEW.original_price := public.apply_price_markup(NEW.original_price);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_markup_products ON public.products;
CREATE TRIGGER trg_markup_products BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.markup_products();

CREATE OR REPLACE FUNCTION public.markup_smart_kits()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.base_total_price := COALESCE(NEW.base_total_price, NEW.total_price);
    NEW.total_price := public.apply_price_markup(NEW.base_total_price);
    NEW.base_discount_price := COALESCE(NEW.base_discount_price, NEW.discount_price);
    NEW.discount_price := public.apply_price_markup(NEW.base_discount_price);
  ELSE
    IF NEW.base_total_price IS DISTINCT FROM OLD.base_total_price THEN
      NEW.total_price := public.apply_price_markup(NEW.base_total_price);
    ELSIF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
      NEW.base_total_price := NEW.total_price;
      NEW.total_price := public.apply_price_markup(NEW.total_price);
    END IF;
    IF NEW.base_discount_price IS DISTINCT FROM OLD.base_discount_price THEN
      NEW.discount_price := public.apply_price_markup(NEW.base_discount_price);
    ELSIF NEW.discount_price IS DISTINCT FROM OLD.discount_price THEN
      NEW.base_discount_price := NEW.discount_price;
      NEW.discount_price := public.apply_price_markup(NEW.discount_price);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_markup_smart_kits ON public.smart_kits;
CREATE TRIGGER trg_markup_smart_kits BEFORE INSERT OR UPDATE ON public.smart_kits
FOR EACH ROW EXECUTE FUNCTION public.markup_smart_kits();

CREATE OR REPLACE FUNCTION public.markup_smart_kit_items()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.base_estimated_price := COALESCE(NEW.base_estimated_price, NEW.estimated_price);
    NEW.estimated_price := COALESCE(public.apply_price_markup(NEW.base_estimated_price), 0);
  ELSE
    IF NEW.base_estimated_price IS DISTINCT FROM OLD.base_estimated_price THEN
      NEW.estimated_price := COALESCE(public.apply_price_markup(NEW.base_estimated_price), 0);
    ELSIF NEW.estimated_price IS DISTINCT FROM OLD.estimated_price THEN
      NEW.base_estimated_price := NEW.estimated_price;
      NEW.estimated_price := COALESCE(public.apply_price_markup(NEW.estimated_price), 0);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_markup_smart_kit_items ON public.smart_kit_items;
CREATE TRIGGER trg_markup_smart_kit_items BEFORE INSERT OR UPDATE ON public.smart_kit_items
FOR EACH ROW EXECUTE FUNCTION public.markup_smart_kit_items();

CREATE OR REPLACE FUNCTION public.markup_simple_price()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.base_price := COALESCE(NEW.base_price, NEW.price);
    NEW.price := public.apply_price_markup(NEW.base_price);
  ELSE
    IF NEW.base_price IS DISTINCT FROM OLD.base_price THEN
      NEW.price := public.apply_price_markup(NEW.base_price);
    ELSIF NEW.price IS DISTINCT FROM OLD.price THEN
      NEW.base_price := NEW.price;
      NEW.price := public.apply_price_markup(NEW.price);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_markup_articles ON public.articles;
CREATE TRIGGER trg_markup_articles BEFORE INSERT OR UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.markup_simple_price();
DROP TRIGGER IF EXISTS trg_markup_educational_content ON public.educational_content;
CREATE TRIGGER trg_markup_educational_content BEFORE INSERT OR UPDATE ON public.educational_content
FOR EACH ROW EXECUTE FUNCTION public.markup_simple_price();
DROP TRIGGER IF EXISTS trg_markup_resources ON public.resources;
CREATE TRIGGER trg_markup_resources BEFORE INSERT OR UPDATE ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.markup_simple_price();

-- 4) Synchronisation du total des kits en prix de base + prix public
CREATE OR REPLACE FUNCTION public.sync_smart_kit_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_kit uuid; v_base numeric;
BEGIN
  target_kit := COALESCE(NEW.kit_id, OLD.kit_id);
  SELECT COALESCE(sum(COALESCE(quantity,1) * COALESCE(base_estimated_price, estimated_price, 0)), 0)
    INTO v_base
    FROM public.smart_kit_items
    WHERE kit_id = target_kit AND COALESCE(is_optional,false) = false;

  UPDATE public.smart_kits
  SET base_total_price = v_base,
      total_price = public.apply_price_markup(v_base),
      updated_at = now()
  WHERE id = target_kit;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5) Application aux données existantes
UPDATE public.products SET base_price = price WHERE base_price IS NULL;
UPDATE public.products SET base_original_price = original_price WHERE base_original_price IS NULL AND original_price IS NOT NULL;
UPDATE public.smart_kit_items SET base_estimated_price = estimated_price WHERE base_estimated_price IS NULL;
UPDATE public.smart_kits SET base_discount_price = discount_price WHERE base_discount_price IS NULL AND discount_price IS NOT NULL;
UPDATE public.smart_kits SET base_total_price = total_price WHERE base_total_price IS NULL;
UPDATE public.articles SET base_price = price WHERE base_price IS NULL AND price IS NOT NULL;
UPDATE public.educational_content SET base_price = price WHERE base_price IS NULL AND price IS NOT NULL;
UPDATE public.resources SET base_price = price WHERE base_price IS NULL AND price IS NOT NULL;

-- 6) Commissions à la confirmation du paiement
DROP FUNCTION IF EXISTS public.finalize_payment_atomic(uuid, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.finalize_payment_atomic(
  _payment_id uuid,
  _transaction_id text,
  _status text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(payment_id uuid, order_id uuid, final_status text, order_confirmed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_confirmed boolean := false;
  v_assigned uuid;
BEGIN
  IF _status NOT IN ('completed', 'failed', 'pending') THEN
    RAISE EXCEPTION 'invalid payment status: %', _status;
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT v_payment.id, v_payment.order_id, 'completed'::text, false;
    RETURN;
  END IF;

  UPDATE public.payments
  SET status = _status,
      transaction_id = COALESCE(_transaction_id, transaction_id),
      metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(_metadata, '{}'::jsonb),
      completed_at = CASE WHEN _status = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END
  WHERE id = _payment_id;

  IF _status = 'completed' AND v_payment.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_payment.order_id FOR UPDATE;

    IF v_order.id IS NOT NULL AND v_order.status = 'pending'::order_status THEN
      UPDATE public.orders
      SET status = 'confirmed'::order_status,
          payment_reference = COALESCE(_transaction_id, payment_reference),
          payment_method = COALESCE(v_payment.payment_method, payment_method),
          updated_at = now()
      WHERE id = v_order.id;
      v_confirmed := true;

      IF v_payment.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          v_payment.user_id,
          'payment',
          'Paiement confirmé',
          'Message généré automatiquement, ne pas répondre. Votre paiement de '
            || to_char(COALESCE(v_payment.amount, 0), 'FM999G999G999') || ' FCFA a été confirmé pour la commande #'
            || left(v_order.id::text, 8) || '.',
          jsonb_build_object('payment_id', v_payment.id, 'order_id', v_order.id, 'provider', 'kkiapay')
        );
      END IF;

      INSERT INTO public.notifications (user_id, type, title, message, data)
      SELECT DISTINCT ur.user_id,
             'payment',
             'Nouveau paiement confirmé',
             'Message généré automatiquement, ne pas répondre. Paiement de '
               || to_char(COALESCE(v_payment.amount, 0), 'FM999G999G999') || ' FCFA reçu pour la commande #'
               || left(v_order.id::text, 8) || '.',
             jsonb_build_object('payment_id', v_payment.id, 'order_id', v_order.id, 'provider', 'kkiapay')
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::app_role, 'super_admin'::app_role, 'comptable'::app_role, 'commercial'::app_role, 'moderator'::app_role);

      -- Commissions établissements manquantes (kits scolaires)
      INSERT INTO public.school_commissions (school_id, order_id, order_item_id, kit_id, sale_amount, commission_rate, commission_amount)
      SELECT sk.school_id, oi.order_id, oi.id, oi.kit_id, oi.total_price, 0.02, round(oi.total_price * 0.02)
      FROM public.order_items oi
      JOIN public.smart_kits sk ON sk.id = oi.kit_id
      WHERE oi.order_id = v_order.id
        AND sk.school_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.school_commissions sc WHERE sc.order_item_id = oi.id);

      -- Commission du commercial affecté à la commande
      SELECT delivery_user_id INTO v_assigned FROM public.orders WHERE id = v_order.id;
      IF v_assigned IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.commissions c WHERE c.order_id = v_order.id AND c.vendor_id = v_assigned
      ) THEN
        INSERT INTO public.commissions (vendor_id, order_id, sale_amount, commission_rate, commission_amount, status)
        VALUES (v_assigned, v_order.id, COALESCE(v_order.total_amount, 0), 0.02, round(COALESCE(v_order.total_amount,0) * 0.02), 'pending');
      END IF;

      IF v_order.delivery_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          v_order.delivery_user_id,
          'order',
          'Commande payée à livrer',
          'Message généré automatiquement, ne pas répondre. La commande #' || left(v_order.id::text, 8) || ' est payée et prête pour la livraison.',
          jsonb_build_object('order_id', v_order.id)
        );
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_payment.id, v_payment.order_id, _status, v_confirmed;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) TO service_role;
