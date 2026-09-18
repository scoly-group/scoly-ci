CREATE OR REPLACE FUNCTION public.get_order_tracking(_reference text)
RETURNS TABLE (
  order_number text,
  status text,
  payment_option text,
  total_amount numeric,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    upper(left(o.id::text, 8)) AS order_number,
    o.status::text,
    o.payment_option::text,
    o.total_amount,
    o.created_at,
    o.updated_at
  FROM public.orders o
  WHERE length(coalesce(_reference, '')) BETWEEN 6 AND 40
    AND o.id::text ILIKE (lower(trim(both '#' from coalesce(_reference, ''))) || '%')
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_order_tracking(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_tracking(text) TO service_role;