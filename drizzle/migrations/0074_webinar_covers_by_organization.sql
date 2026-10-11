-- As capas (webinar-covers) ficam em <webinar id>/<ficheiro>. As regras antigas só olhavam ao bucket:
-- qualquer utilizador autenticado lia, substituía e apagava as imagens de outra organização.
-- Agora só membros da organização do webinar tocam na pasta dele, como nos vídeos (0023).
DROP POLICY IF EXISTS "webinar_covers_read" ON storage.objects;
DROP POLICY IF EXISTS "webinar_covers_insert" ON storage.objects;
DROP POLICY IF EXISTS "webinar_covers_update" ON storage.objects;
DROP POLICY IF EXISTS "webinar_covers_delete" ON storage.objects;

CREATE OR REPLACE FUNCTION public.owns_webinar_folder(_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.webinars w
    JOIN public.organization_members m ON m.organization_id = w.organization_id
    WHERE m.user_id = auth.uid()
      AND w.id::text = (storage.foldername(_name))[1]
  );
$$;
REVOKE ALL ON FUNCTION public.owns_webinar_folder(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.owns_webinar_folder(text) TO authenticated;

CREATE POLICY "webinar_covers_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'webinar-covers' AND public.owns_webinar_folder(name));
CREATE POLICY "webinar_covers_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'webinar-covers' AND public.owns_webinar_folder(name));
CREATE POLICY "webinar_covers_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'webinar-covers' AND public.owns_webinar_folder(name))
  WITH CHECK (bucket_id = 'webinar-covers' AND public.owns_webinar_folder(name));
CREATE POLICY "webinar_covers_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'webinar-covers' AND public.owns_webinar_folder(name));
