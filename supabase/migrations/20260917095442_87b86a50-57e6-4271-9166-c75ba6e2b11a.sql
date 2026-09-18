CREATE OR REPLACE FUNCTION public.reserve_email_log(_dedupe_key text, _recipient_email text, _email_type text, _email_category text DEFAULT NULL::text, _order_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS email_logs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.email_logs;
BEGIN
  IF _dedupe_key IS NOT NULL THEN
    SELECT * INTO v_row FROM public.email_logs WHERE dedupe_key = _dedupe_key LIMIT 1;
    IF FOUND THEN
      UPDATE public.email_logs SET updated_at = now() WHERE id = v_row.id RETURNING * INTO v_row;
      RETURN v_row;
    END IF;
  END IF;

  INSERT INTO public.email_logs (
    dedupe_key, recipient_email, email_type, email_category, order_id, metadata,
    status, attempt_count, created_at, updated_at, last_attempt_at
  ) VALUES (
    _dedupe_key, _recipient_email, _email_type, _email_category, _order_id,
    COALESCE(_metadata, '{}'::jsonb), 'queued', 0, now(), now(), now()
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE
    SET updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;