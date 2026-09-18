-- 1. Move any remaining direct file URLs into the protected side table
INSERT INTO public.educational_content_files (content_id, file_url)
SELECT ec.id, ec.file_url
FROM public.educational_content ec
WHERE ec.file_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.educational_content_files f WHERE f.content_id = ec.id)
ON CONFLICT DO NOTHING;

UPDATE public.educational_content SET file_url = NULL WHERE file_url IS NOT NULL;

-- 2. Remove read access to the file_url column for clients; only the
--    SECURITY DEFINER accessor may resolve download links.
REVOKE SELECT ON public.educational_content FROM anon, authenticated;

GRANT SELECT (id, author_id, title, description, content_type, subject, grade_level,
              preview_url, price, is_free, is_approved, downloads, rating_avg,
              rating_count, created_at, updated_at)
  ON public.educational_content TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.educational_content TO authenticated;
GRANT ALL ON public.educational_content TO service_role;
