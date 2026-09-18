CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text := NEW.status::text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      NEW.user_id,
      'order',
      CASE v_status
        WHEN 'confirmed' THEN 'Commande confirmée'
        WHEN 'processing' THEN 'Commande en préparation'
        WHEN 'shipped' THEN 'Commande expédiée'
        WHEN 'delivered' THEN 'Commande livrée'
        WHEN 'cancelled' THEN 'Commande annulée'
        ELSE 'Mise à jour de commande'
      END,
      'Message généré automatiquement, ne pas répondre. ' ||
      CASE v_status
        WHEN 'confirmed' THEN 'Votre commande #' || LEFT(NEW.id::text, 8) || ' a été confirmée et est en cours de traitement.'
        WHEN 'processing' THEN 'Votre commande #' || LEFT(NEW.id::text, 8) || ' est en cours de préparation.'
        WHEN 'shipped' THEN 'Votre commande #' || LEFT(NEW.id::text, 8) || ' a été expédiée. Vous serez contacté pour la livraison.'
        WHEN 'delivered' THEN 'Votre commande #' || LEFT(NEW.id::text, 8) || ' a été livrée avec succès. Merci pour votre confiance !'
        WHEN 'cancelled' THEN 'Votre commande #' || LEFT(NEW.id::text, 8) || ' a été annulée.'
        ELSE 'Le statut de votre commande #' || LEFT(NEW.id::text, 8) || ' a été mis à jour.'
      END,
      jsonb_build_object(
        'order_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'amount', NEW.total_amount
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;