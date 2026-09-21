
-- 1. Déclencheurs en double : une seule notification par événement
DROP TRIGGER IF EXISTS on_order_status_change ON public.orders;
DROP TRIGGER IF EXISTS on_payment_status_change ON public.payments;
DROP TRIGGER IF EXISTS audit_orders ON public.orders;

-- 2. Registre d'idempotence des envois
CREATE TABLE IF NOT EXISTS public.notification_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  event text NOT NULL,
  channel text NOT NULL,
  recipient text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_dispatches_unique
  ON public.notification_dispatches (COALESCE(order_id, '00000000-0000-0000-0000-000000000000'::uuid), event, channel, recipient);

GRANT ALL ON public.notification_dispatches TO service_role;
ALTER TABLE public.notification_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.notification_dispatches;
CREATE POLICY "Service role only" ON public.notification_dispatches
  FOR ALL USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.claim_notification(
  _order_id uuid, _event text, _channel text, _recipient text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_dispatches (order_id, event, channel, recipient)
  VALUES (_order_id, _event, _channel, _recipient)
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification(uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification(uuid, text, text, text) TO service_role;

-- 3. Trafic : ajout des sources
CREATE OR REPLACE FUNCTION public.get_traffic_overview(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from timestamptz := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
  _result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'moderator')
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT jsonb_build_object(
    'total_counter', (SELECT value FROM public.site_counters WHERE key = 'total_visits'),
    'page_views', (SELECT count(*) FROM public.visits WHERE created_at >= _from),
    'unique_visitors', (SELECT count(DISTINCT session_id) FROM public.visits WHERE created_at >= _from),
    'countries_count', (SELECT count(DISTINCT country_code) FROM public.visits WHERE created_at >= _from AND country_code IS NOT NULL),
    'by_day', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT date_trunc('day', created_at)::date AS day,
               count(*) AS views,
               count(DISTINCT session_id) AS visitors
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 1
      ) t), '[]'::jsonb),
    'by_country', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(country_name, 'Inconnu') AS country,
               country_code, count(*) AS views,
               count(DISTINCT session_id) AS visitors
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50
      ) t), '[]'::jsonb),
    'by_continent', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(continent, 'Inconnu') AS continent, count(*) AS views
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 2 DESC
      ) t), '[]'::jsonb),
    'by_city', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(city, 'Inconnu') AS city,
               COALESCE(country_name, '') AS country,
               count(*) AS views
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50
      ) t), '[]'::jsonb),
    'by_page', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT path, count(*) AS views
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 2 DESC LIMIT 25
      ) t), '[]'::jsonb),
    'by_source', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT CASE
                 WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
                 ELSE split_part(split_part(regexp_replace(referrer, '^https?://', ''), '/', 1), ':', 1)
               END AS source,
               count(*) AS views,
               count(DISTINCT session_id) AS visitors
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 2 DESC LIMIT 25
      ) t), '[]'::jsonb),
    'by_device', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(device_type, 'inconnu') AS device, count(*) AS views
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 2 DESC
      ) t), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;
