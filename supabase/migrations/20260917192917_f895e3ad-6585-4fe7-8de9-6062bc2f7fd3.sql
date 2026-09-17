DROP POLICY IF EXISTS lore_assets_update ON storage.objects;
CREATE POLICY lore_assets_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'lore-assets' AND (storage.foldername(name))[1] = (auth.uid())::text)
WITH CHECK (bucket_id = 'lore-assets' AND (storage.foldername(name))[1] = (auth.uid())::text);