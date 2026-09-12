ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS model_path text;

CREATE POLICY models_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY models_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY models_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY models_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'models' AND (storage.foldername(name))[1] = auth.uid()::text);