CREATE POLICY "Service role manages KkiaPay events"
ON public.kkiapay_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_kkiapay_event_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_kkiapay_event_updated_at ON public.kkiapay_events;
CREATE TRIGGER touch_kkiapay_event_updated_at
BEFORE UPDATE ON public.kkiapay_events
FOR EACH ROW
EXECUTE FUNCTION public.touch_kkiapay_event_updated_at();

REVOKE ALL ON FUNCTION public.touch_kkiapay_event_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_kkiapay_event_updated_at() TO service_role;