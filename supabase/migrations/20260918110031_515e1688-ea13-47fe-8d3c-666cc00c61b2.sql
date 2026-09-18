CREATE POLICY "No direct client access to phone account mapping"
ON public.client_phone_accounts
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);