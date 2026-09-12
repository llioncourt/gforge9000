DROP POLICY IF EXISTS models_select ON storage.objects;
CREATE POLICY models_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'models'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (
        (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
        AND private.can_view_character(((storage.foldername(name))[2])::uuid, auth.uid())
      )
    )
  );