
ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;

CREATE OR REPLACE FUNCTION public.auto_assign_commercial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID;
BEGIN
  IF NEW.status IN ('confirmed','shipped')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.delivery_user_id IS NULL THEN

    IF NEW.zone_id IS NOT NULL THEN
      v_user := public.pick_available_commercial(NEW.zone_id);
    END IF;

    -- Repli : commercial livreur ayant le moins de livraisons en cours.
    IF v_user IS NULL THEN
      SELECT ur.user_id INTO v_user
      FROM public.user_roles ur
      WHERE ur.role IN ('commercial','delivery')
      ORDER BY (
        SELECT count(*) FROM public.orders o
        WHERE o.delivery_user_id = ur.user_id
          AND o.status NOT IN ('delivered','cancelled')
      ) ASC, ur.user_id
      LIMIT 1;
    END IF;

    IF v_user IS NOT NULL THEN
      NEW.delivery_user_id := v_user;
      NEW.assigned_at := now();
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        v_user,
        'order',
        'Nouvelle commande attribuée',
        'Message généré automatiquement, ne pas répondre. Une nouvelle commande #' || LEFT(NEW.id::text, 8) || ' vous est attribuée pour livraison.',
        jsonb_build_object('order_id', NEW.id, 'zone_id', NEW.zone_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS TABLE(total_products bigint, total_orders bigint, total_users bigint, total_revenue numeric, monthly_revenue numeric, pending_orders bigint, total_articles bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied. Admin role required.';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.products WHERE is_active = true)::BIGINT,
    (SELECT COUNT(*) FROM public.orders)::BIGINT,
    (SELECT COUNT(*) FROM public.profiles)::BIGINT,
    (SELECT COALESCE(SUM(COALESCE(subtotal_amount, amount)), 0) FROM public.payments WHERE status = 'completed'),
    (SELECT COALESCE(SUM(COALESCE(subtotal_amount, amount)), 0) FROM public.payments
       WHERE status = 'completed' AND created_at >= date_trunc('month', CURRENT_DATE)),
    (SELECT COUNT(*) FROM public.orders WHERE status = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM public.articles WHERE status = 'published')::BIGINT;
END;
$function$;
