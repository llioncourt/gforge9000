-- Pack covers.
--
-- A content pack can carry a cover image, shown behind its card the same way
-- a character's portrait sits behind the character card.
--
-- The file lives in the existing private `portraits` bucket, under the pack
-- owner's own folder: `<owner id>/pack-cover/<random>.avif`. The owner already
-- has full access to that folder through the bucket's existing rules. The one
-- new rule lets anyone who can already see a pack read that pack's cover.
--
-- Safe to run more than once.

ALTER TABLE public.content_packs ADD COLUMN IF NOT EXISTS cover_path text;

DROP POLICY IF EXISTS portraits_select_pack_covers ON storage.objects;
CREATE POLICY portraits_select_pack_covers ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'portraits'
  AND (storage.foldername(name))[2] = 'pack-cover'
  -- content_packs is read with the caller's own access rules, so this matches
  -- only packs the caller can see. The file must sit in that pack owner's
  -- folder, so a pack can never point at somebody else's file.
  AND EXISTS (
    SELECT 1
    FROM public.content_packs p
    WHERE p.cover_path = objects.name
      AND (storage.foldername(objects.name))[1] = p.owner_id::text
  )
);

-- Rollback:
--   DROP POLICY IF EXISTS portraits_select_pack_covers ON storage.objects;
--   ALTER TABLE public.content_packs DROP COLUMN IF EXISTS cover_path;
