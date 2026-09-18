-- 1) Vue publique des établissements : uniquement nom + localité
DROP VIEW IF EXISTS public.public_schools;
CREATE VIEW public.public_schools
WITH (security_invoker = true) AS
SELECT id, name, city
FROM public.schools
WHERE is_active = true AND status = 'approved';

GRANT SELECT ON public.public_schools TO anon;
GRANT SELECT ON public.public_schools TO authenticated;
GRANT ALL ON public.public_schools TO service_role;

-- 2) Seuls les paiements réellement encaissés sont conservés
DELETE FROM public.payments WHERE status <> 'completed';

-- 3) Commandes jamais payées : suppression des articles puis des commandes
DELETE FROM public.order_items
WHERE order_id IN (
  SELECT o.id FROM public.orders o
  WHERE o.status IN ('pending', 'cancelled')
    AND NOT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.order_id = o.id AND p.status = 'completed'
    )
);

DELETE FROM public.orders o
WHERE o.status IN ('pending', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.order_id = o.id AND p.status = 'completed'
  );