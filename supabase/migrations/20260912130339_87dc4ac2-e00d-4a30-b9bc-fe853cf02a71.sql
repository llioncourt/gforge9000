CREATE POLICY portraits_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'portraits' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY portraits_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'portraits' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY portraits_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'portraits' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'portraits' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY portraits_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'portraits' AND (storage.foldername(name))[1] = auth.uid()::text);