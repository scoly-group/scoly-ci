CREATE TABLE public.kkiapay_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL UNIQUE,
  event_type text,
  provider_status text NOT NULL DEFAULT 'received',
  amount numeric NOT NULL DEFAULT 0,
  performed_at timestamptz,
  account text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciliation_status text NOT NULL DEFAULT 'pending',
  reconciliation_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.kkiapay_events TO service_role;
ALTER TABLE public.kkiapay_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX kkiapay_events_reconciliation_idx
  ON public.kkiapay_events (reconciliation_status, performed_at DESC);

CREATE OR REPLACE FUNCTION public.guard_delivered_status_requires_customer_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered'::public.order_status
     AND NEW.customer_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Customer confirmation is required before marking an order delivered';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_delivered_status_requires_customer_confirmation ON public.orders;
CREATE TRIGGER guard_delivered_status_requires_customer_confirmation
BEFORE INSERT OR UPDATE OF status, customer_confirmed_at ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_delivered_status_requires_customer_confirmation();