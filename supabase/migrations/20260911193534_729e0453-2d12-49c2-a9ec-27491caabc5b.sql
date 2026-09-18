GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_module(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_counters() TO anon, authenticated;

ALTER POLICY "Admins can manage all products" ON public.products TO authenticated;
ALTER POLICY "Vendors can manage their products" ON public.products TO authenticated;
ALTER POLICY "Admins can manage all articles" ON public.articles TO authenticated;
ALTER POLICY "Authors can manage their articles" ON public.articles TO authenticated;