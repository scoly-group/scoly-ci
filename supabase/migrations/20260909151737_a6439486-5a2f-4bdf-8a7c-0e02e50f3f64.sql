CREATE TABLE IF NOT EXISTS public.educational_content_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.educational_content(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  purchased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecp_user_content ON public.educational_content_purchases(user_id, content_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecp_unique_completed
  ON public.educational_content_purchases(user_id, content_id)
  WHERE status = 'completed';

GRANT SELECT ON public.educational_content_purchases TO authenticated;
GRANT ALL ON public.educational_content_purchases TO service_role;

ALTER TABLE public.educational_content_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own content purchases"
ON public.educational_content_purchases FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins view all content purchases"
ON public.educational_content_purchases FOR SELECT TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role)
       OR public.has_role((SELECT auth.uid()), 'super_admin'::app_role));

CREATE TRIGGER trg_ecp_updated_at
BEFORE UPDATE ON public.educational_content_purchases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Authenticated can browse approved free content" ON public.educational_content;
DROP POLICY IF EXISTS "Public can view approved free content" ON public.educational_content;

CREATE POLICY "Anyone can browse approved content"
ON public.educational_content FOR SELECT
USING (is_approved = true);

CREATE OR REPLACE FUNCTION public.get_educational_content_file_url(_content_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_is_free boolean; v_author uuid; v_url text;
BEGIN
  SELECT is_free, author_id, file_url INTO v_is_free, v_author, v_url
  FROM public.educational_content WHERE id = _content_id AND is_approved = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Content not found'; END IF;

  IF COALESCE(v_is_free, false) = true THEN RETURN v_url; END IF;

  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF v_uid = v_author
     OR public.has_role(v_uid,'admin'::app_role)
     OR public.has_role(v_uid,'super_admin'::app_role)
     OR public.has_role(v_uid,'moderator'::app_role)
     OR EXISTS (SELECT 1 FROM public.educational_content_purchases
                WHERE content_id = _content_id AND user_id = v_uid AND status = 'completed')
  THEN
    SELECT file_url INTO v_url FROM public.educational_content_files WHERE content_id = _content_id;
    RETURN v_url;
  ELSE
    RAISE EXCEPTION 'Access denied: purchase required';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_educational_content_file_url(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_educational_content_file_url(uuid) TO authenticated;
