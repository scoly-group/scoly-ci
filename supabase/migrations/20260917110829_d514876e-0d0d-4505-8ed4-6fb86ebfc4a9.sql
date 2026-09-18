ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_option text NOT NULL DEFAULT 'online';

CREATE INDEX IF NOT EXISTS orders_payment_option_idx ON public.orders (payment_option);

COMMENT ON COLUMN public.orders.payment_option IS 'online = paiement en ligne immédiat, cash_on_delivery = paiement à la livraison';