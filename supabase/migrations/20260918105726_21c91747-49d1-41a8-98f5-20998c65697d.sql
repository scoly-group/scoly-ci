CREATE TABLE public.client_phone_accounts (
  phone_normalized text PRIMARY KEY,
  client_user_id uuid NOT NULL UNIQUE,
  linked_internal_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.client_phone_accounts TO service_role;
ALTER TABLE public.client_phone_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.establishment_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.establishment_access_requests TO authenticated;
GRANT ALL ON public.establishment_access_requests TO service_role;
ALTER TABLE public.establishment_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read establishment access requests"
ON public.establishment_access_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "Staff update establishment access requests"
ON public.establishment_access_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'moderator'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE INDEX establishment_access_requests_status_created_idx
ON public.establishment_access_requests(status, created_at DESC);
CREATE UNIQUE INDEX establishment_access_requests_pending_email_idx
ON public.establishment_access_requests(lower(email)) WHERE status = 'pending';

CREATE TRIGGER update_client_phone_accounts_updated_at
BEFORE UPDATE ON public.client_phone_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_establishment_access_requests_updated_at
BEFORE UPDATE ON public.establishment_access_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();