
CREATE OR REPLACE FUNCTION public.guard_comment_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_staff boolean;
BEGIN
  is_staff := public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
           OR public.has_role(auth.uid(), 'moderator'::public.app_role);
  IF is_staff OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_approved := false;
  ELSE
    NEW.is_approved := OLD.is_approved;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_comment_moderation_trg ON public.article_comments;
CREATE TRIGGER guard_comment_moderation_trg
BEFORE INSERT OR UPDATE ON public.article_comments
FOR EACH ROW EXECUTE FUNCTION public.guard_comment_moderation();

CREATE OR REPLACE FUNCTION public.guard_educational_content_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_staff boolean;
BEGIN
  is_staff := public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
           OR public.has_role(auth.uid(), 'moderator'::public.app_role);
  IF is_staff OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_approved := false;
  ELSE
    NEW.is_approved := OLD.is_approved;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_educational_content_approval_trg ON public.educational_content;
CREATE TRIGGER guard_educational_content_approval_trg
BEFORE INSERT OR UPDATE ON public.educational_content
FOR EACH ROW EXECUTE FUNCTION public.guard_educational_content_approval();

CREATE OR REPLACE FUNCTION public.guard_product_curation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_staff boolean;
BEGIN
  is_staff := public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
           OR public.has_role(auth.uid(), 'moderator'::public.app_role);
  IF is_staff OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_featured := false;
  ELSE
    NEW.is_featured := OLD.is_featured;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS guard_product_curation_trg ON public.products;
CREATE TRIGGER guard_product_curation_trg
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_product_curation();

REVOKE EXECUTE ON FUNCTION public.guard_comment_moderation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_educational_content_approval() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_product_curation() FROM PUBLIC, anon, authenticated;
