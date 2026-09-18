REVOKE ALL ON FUNCTION public.grant_school_manager_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_school_manager_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_school_kit_commission() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_school_balance(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_balance(uuid) TO authenticated;