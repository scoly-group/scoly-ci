DO $do$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END
$do$;

DROP POLICY IF EXISTS "Public can view approved schools" ON public.schools;
REVOKE SELECT ON TABLE public.schools FROM anon;

REVOKE ALL ON TABLE public.public_schools FROM PUBLIC;
GRANT SELECT ON TABLE public.public_schools TO anon, authenticated, service_role;