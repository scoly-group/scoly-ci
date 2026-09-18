ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric,
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_charged numeric,
  ADD COLUMN IF NOT EXISTS payment_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_email_sent_at timestamptz;

-- Montant à débiter au client : le sous-total majoré des frais MoneyFusion (3 %)
CREATE OR REPLACE FUNCTION public.moneyfusion_charge_amount(_subtotal numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN COALESCE(_subtotal, 0) <= 0 THEN 0
              ELSE ceil(_subtotal / 0.97)
         END;
$$;

REVOKE ALL ON FUNCTION public.moneyfusion_charge_amount(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moneyfusion_charge_amount(numeric) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.finalize_payment_atomic(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.finalize_payment_atomic(
  _payment_id uuid,
  _transaction_id text,
  _status text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(payment_id uuid, order_id uuid, final_status text, order_confirmed boolean, notify_needed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_confirmed boolean := false;
  v_notify boolean := false;
BEGIN
  IF _status NOT IN ('completed', 'failed', 'pending') THEN
    RAISE EXCEPTION 'invalid payment status: %', _status;
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  -- Idempotence : un paiement encaissé n'est jamais rétrogradé ni retraité.
  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT v_payment.id, v_payment.order_id, 'completed'::text, false, false;
    RETURN;
  END IF;

  UPDATE public.payments
  SET status = _status,
      transaction_id = COALESCE(_transaction_id, transaction_id),
      metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(_metadata, '{}'::jsonb),
      completed_at = CASE WHEN _status = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END
  WHERE id = _payment_id;

  IF _status = 'completed' THEN
    -- Panier serveur vidé de façon idempotente dès l'encaissement.
    IF v_payment.user_id IS NOT NULL THEN
      DELETE FROM public.cart_items WHERE user_id = v_payment.user_id;
    END IF;
  END IF;

  IF _status = 'completed' AND v_payment.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_payment.order_id FOR UPDATE;

    IF v_order.id IS NOT NULL THEN
      -- Détail des frais reporté sur la commande (affichage client / admin / reçu).
      UPDATE public.orders
      SET payment_fee_amount = COALESCE(v_payment.fee_amount, 0),
          amount_charged = COALESCE(v_payment.amount, amount_charged),
          updated_at = now()
      WHERE id = v_order.id;

      -- Confirmation unique : réservée par le premier appel gagnant.
      UPDATE public.orders
      SET payment_notified_at = now()
      WHERE id = v_order.id AND payment_notified_at IS NULL;
      v_notify := FOUND;
    END IF;

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
          jsonb_build_object('payment_id', v_payment.id, 'order_id', v_order.id, 'provider', COALESCE(v_payment.payment_method, 'moneyfusion'))
        );
      END IF;

      INSERT INTO public.notifications (user_id, type, title, message, data)
      SELECT DISTINCT ur.user_id,
             'payment',
             'Nouveau paiement confirmé',
             'Message généré automatiquement, ne pas répondre. Paiement de '
               || to_char(COALESCE(v_payment.amount, 0), 'FM999G999G999') || ' FCFA reçu pour la commande #'
               || left(v_order.id::text, 8) || '.',
             jsonb_build_object('payment_id', v_payment.id, 'order_id', v_order.id, 'provider', COALESCE(v_payment.payment_method, 'moneyfusion'))
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::app_role, 'super_admin'::app_role, 'comptable'::app_role, 'commercial'::app_role, 'moderator'::app_role);

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

  RETURN QUERY SELECT v_payment.id, v_payment.order_id, _status, v_confirmed, v_notify;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) TO service_role;

-- Réservation atomique de l'envoi de l'email « paiement encaissé »
CREATE OR REPLACE FUNCTION public.claim_paid_order_email(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_claimed boolean := false;
BEGIN
  UPDATE public.orders
  SET paid_email_sent_at = now()
  WHERE id = _order_id AND paid_email_sent_at IS NULL;
  v_claimed := FOUND;
  RETURN v_claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_paid_order_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_paid_order_email(uuid) TO service_role;