DROP POLICY IF EXISTS campaign_packages_select ON storage.objects;
CREATE POLICY campaign_packages_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-packages' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS campaign_packages_insert ON storage.objects;
CREATE POLICY campaign_packages_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-packages' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS campaign_packages_update ON storage.objects;
CREATE POLICY campaign_packages_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-packages' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'campaign-packages' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS campaign_packages_delete ON storage.objects;
CREATE POLICY campaign_packages_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-packages' AND (storage.foldername(name))[1] = auth.uid()::text);