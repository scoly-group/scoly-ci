DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.get_product_reviews(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_counters() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_article_views(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_product_views(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_newsletter_subscription(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_newsletter(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;