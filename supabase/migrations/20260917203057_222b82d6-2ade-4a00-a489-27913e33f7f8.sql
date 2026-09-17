-- 1. Stable import identity -------------------------------------------------
ALTER TABLE public.campaigns  ADD COLUMN IF NOT EXISTS import_key text;
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS import_key text;
ALTER TABLE public.entities   ADD COLUMN IF NOT EXISTS import_key text;
ALTER TABLE public.maps       ADD COLUMN IF NOT EXISTS import_key text;

COMMENT ON COLUMN public.campaigns.import_key IS 'Deterministic identity of the file this row was imported from; makes re-imports idempotent.';

CREATE UNIQUE INDEX IF NOT EXISTS campaigns_import_key_uniq
  ON public.campaigns (gm_id, import_key) WHERE import_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS characters_import_key_uniq
  ON public.characters (owner_id, import_key) WHERE import_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS entities_import_key_uniq
  ON public.entities (campaign_id, import_key) WHERE import_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maps_import_key_uniq
  ON public.maps (campaign_id, import_key) WHERE import_key IS NOT NULL;

-- 2. No duplicate relationships ---------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS entity_relationships_unique_edge
  ON public.entity_relationships (campaign_id, source_id, target_id, rel_type);

-- 3. Soundtrack fields that previously did not survive a round trip ----------
ALTER TABLE public.campaign_soundtrack_albums ADD COLUMN IF NOT EXISTS game_slug text;
ALTER TABLE public.campaign_soundtrack_albums ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.campaign_soundtrack_tracks ADD COLUMN IF NOT EXISTS lyrics text;

-- 4. Profile photos are readable by people sharing a campaign ----------------
DROP POLICY IF EXISTS portraits_select_avatars ON storage.objects;
CREATE POLICY portraits_select_avatars ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'portraits'
  AND (storage.foldername(name))[2] = 'avatar'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR private.shares_campaign(((storage.foldername(name))[1])::uuid, auth.uid())
  )
);

-- 5. GM transfer: record the live definition in source and lock down EXECUTE --
CREATE OR REPLACE FUNCTION public.transfer_campaign_gm(_campaign uuid, _new_gm uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = _campaign AND c.gm_id = auth.uid()) THEN
    RAISE EXCEPTION 'only the current GM can transfer the role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaign_members m WHERE m.campaign_id = _campaign AND m.user_id = _new_gm) THEN
    RAISE EXCEPTION 'new GM must be a member of the campaign';
  END IF;
  UPDATE public.campaigns SET gm_id = _new_gm WHERE id = _campaign;
  UPDATE public.campaign_members SET role = 'player' WHERE campaign_id = _campaign AND user_id = auth.uid();
  UPDATE public.campaign_members SET role = 'gm' WHERE campaign_id = _campaign AND user_id = _new_gm;
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_campaign_gm(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_campaign_gm(uuid, uuid) TO authenticated;

-- 6. Atomic account wipe ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wipe_all_my_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM public.character_weapon_state
   WHERE character_id IN (SELECT id FROM public.characters WHERE owner_id = _uid);
  DELETE FROM public.character_versions
   WHERE character_id IN (SELECT id FROM public.characters WHERE owner_id = _uid);
  DELETE FROM public.character_entries
   WHERE character_id IN (SELECT id FROM public.characters WHERE owner_id = _uid);
  DELETE FROM public.roll_history WHERE user_id = _uid;
  DELETE FROM public.characters WHERE owner_id = _uid;

  DELETE FROM public.campaign_notes
   WHERE author_id = _uid
      OR campaign_id IN (SELECT id FROM public.campaigns WHERE gm_id = _uid);
  DELETE FROM public.campaign_members
   WHERE user_id = _uid
      OR campaign_id IN (SELECT id FROM public.campaigns WHERE gm_id = _uid);
  DELETE FROM public.campaigns WHERE gm_id = _uid;

  DELETE FROM public.library_entries WHERE owner_id = _uid;
  DELETE FROM public.content_packs WHERE owner_id = _uid;
  DELETE FROM public.notifications WHERE user_id = _uid OR created_by = _uid;
  DELETE FROM public.push_subscriptions WHERE user_id = _uid;
END;
$function$;

COMMENT ON FUNCTION public.wipe_all_my_data() IS 'Deletes every record owned by the calling user in one transaction. Authorises on auth.uid() only.';

REVOKE ALL ON FUNCTION public.wipe_all_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wipe_all_my_data() TO authenticated;