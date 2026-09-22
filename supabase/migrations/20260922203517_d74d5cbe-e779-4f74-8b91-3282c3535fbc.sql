-- 1. Media visibility ------------------------------------------------------

ALTER TABLE public.campaign_soundtrack_albums
  ADD COLUMN IF NOT EXISTS visible_to_players boolean NOT NULL DEFAULT true;
ALTER TABLE public.campaign_sound_fx
  ADD COLUMN IF NOT EXISTS visible_to_players boolean NOT NULL DEFAULT true;
ALTER TABLE public.campaign_videos
  ADD COLUMN IF NOT EXISTS visible_to_players boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS campaign_soundtrack_albums_read ON public.campaign_soundtrack_albums;
CREATE POLICY campaign_soundtrack_albums_read ON public.campaign_soundtrack_albums
  FOR SELECT TO authenticated
  USING (
    private.is_campaign_gm(campaign_id, auth.uid())
    OR (visible_to_players AND private.is_campaign_member(campaign_id, auth.uid()))
  );

DROP POLICY IF EXISTS campaign_soundtrack_tracks_read ON public.campaign_soundtrack_tracks;
CREATE POLICY campaign_soundtrack_tracks_read ON public.campaign_soundtrack_tracks
  FOR SELECT TO authenticated
  USING (
    private.is_campaign_gm(campaign_id, auth.uid())
    OR (
      private.is_campaign_member(campaign_id, auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.campaign_soundtrack_albums a
        WHERE a.id = campaign_soundtrack_tracks.album_id AND a.visible_to_players
      )
    )
  );

DROP POLICY IF EXISTS campaign_soundtrack_state_read ON public.campaign_soundtrack_state;
CREATE POLICY campaign_soundtrack_state_read ON public.campaign_soundtrack_state
  FOR SELECT TO authenticated
  USING (
    private.is_campaign_gm(campaign_id, auth.uid())
    OR (
      private.is_campaign_member(campaign_id, auth.uid())
      AND (
        album_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.campaign_soundtrack_albums a
          WHERE a.id = campaign_soundtrack_state.album_id AND a.visible_to_players
        )
      )
    )
  );

DROP POLICY IF EXISTS campaign_sound_fx_read ON public.campaign_sound_fx;
CREATE POLICY campaign_sound_fx_read ON public.campaign_sound_fx
  FOR SELECT TO authenticated
  USING (
    private.is_campaign_gm(campaign_id, auth.uid())
    OR (visible_to_players AND private.is_campaign_member(campaign_id, auth.uid()))
  );

DROP POLICY IF EXISTS campaign_sound_fx_state_read ON public.campaign_sound_fx_state;
CREATE POLICY campaign_sound_fx_state_read ON public.campaign_sound_fx_state
  FOR SELECT TO authenticated
  USING (
    private.is_campaign_gm(campaign_id, auth.uid())
    OR (
      private.is_campaign_member(campaign_id, auth.uid())
      AND (
        effect_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.campaign_sound_fx f
          WHERE f.id = campaign_sound_fx_state.effect_id AND f.visible_to_players
        )
      )
    )
  );

DROP POLICY IF EXISTS campaign_intros_read ON public.campaign_videos;
CREATE POLICY campaign_intros_read ON public.campaign_videos
  FOR SELECT TO authenticated
  USING (
    private.is_campaign_gm(campaign_id, auth.uid())
    OR (visible_to_players AND private.is_campaign_member(campaign_id, auth.uid()))
  );

-- 2. Invite rotation --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rotate_campaign_invite(_campaign uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _code text;
  _try int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = _campaign AND c.gm_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the Game Master of this campaign can change its invite code.';
  END IF;

  LOOP
    _try := _try + 1;
    _code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      UPDATE public.campaigns SET invite_code = _code, updated_at = now() WHERE id = _campaign;
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      IF _try >= 10 THEN RAISE EXCEPTION 'Could not generate a new invite code. Try again.'; END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_campaign_invite(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.rotate_campaign_invite(uuid) TO authenticated;

-- 3. Atomic history restores ------------------------------------------------

CREATE OR REPLACE FUNCTION public.restore_entity_revision(_revision uuid)
RETURNS public.entities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _rev public.entity_revisions;
  _snap jsonb;
  _row public.entities;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _rev FROM public.entity_revisions WHERE id = _revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saved version not found.'; END IF;
  IF NOT private.is_campaign_gm(_rev.campaign_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the campaign Game Master can restore a saved version.';
  END IF;

  _snap := _rev.snapshot;

  UPDATE public.entities e SET
    kind               = COALESCE(_snap->>'kind', e.kind),
    name               = COALESCE(_snap->>'name', e.name),
    aliases            = COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(COALESCE(_snap->'aliases','[]'::jsonb)) AS value), e.aliases),
    summary            = _snap->>'summary',
    player_description = _snap->>'player_description',
    description        = _snap->>'description',
    gm_notes           = _snap->>'gm_notes',
    status             = COALESCE(_snap->>'status', e.status),
    visibility         = COALESCE(_snap->>'visibility', e.visibility),
    parent_id          = NULLIF(_snap->>'parent_id','')::uuid,
    owner_user_id      = NULLIF(_snap->>'owner_user_id','')::uuid,
    character_id       = NULLIF(_snap->>'character_id','')::uuid,
    tags               = COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(COALESCE(_snap->'tags','[]'::jsonb)) AS value), e.tags),
    image_url          = _snap->>'image_url',
    data               = COALESCE(_snap->'data', e.data),
    sort_order         = COALESCE((_snap->>'sort_order')::int, e.sort_order),
    canon_locked       = COALESCE((_snap->>'canon_locked')::boolean, e.canon_locked),
    updated_at         = now()
  WHERE e.id = _rev.entity_id
  RETURNING * INTO _row;

  IF NOT FOUND THEN RAISE EXCEPTION 'The entry this version belongs to no longer exists.'; END IF;
  IF _row.parent_id = _row.id THEN
    RAISE EXCEPTION 'That saved version would make the entry its own parent.';
  END IF;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_entity_revision(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.restore_entity_revision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_character_version(_version uuid)
RETURNS public.characters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _ver public.character_versions;
  _snap jsonb;
  _char jsonb;
  _row public.characters;
  _campaign uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _ver FROM public.character_versions WHERE id = _version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saved version not found.'; END IF;

  SELECT campaign_id INTO _campaign FROM public.characters WHERE id = _ver.character_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The sheet this version belongs to no longer exists.'; END IF;
  IF NOT (
    private.owns_character(_ver.character_id, auth.uid())
    OR (_campaign IS NOT NULL AND private.is_campaign_gm(_campaign, auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Only the sheet owner or their campaign Game Master can restore a saved version.';
  END IF;

  _snap := _ver.snapshot;
  _char := COALESCE(_snap->'character', '{}'::jsonb);

  UPDATE public.characters c SET
    name         = COALESCE(_char->>'name', c.name),
    player_name  = _char->>'player_name',
    concept      = _char->>'concept',
    point_budget = COALESCE((_char->>'point_budget')::int, c.point_budget),
    tech_level   = COALESCE((_char->>'tech_level')::int, c.tech_level),
    st           = COALESCE((_char->>'st')::int, c.st),
    dx           = COALESCE((_char->>'dx')::int, c.dx),
    iq           = COALESCE((_char->>'iq')::int, c.iq),
    ht           = COALESCE((_char->>'ht')::int, c.ht),
    hp_delta     = COALESCE((_char->>'hp_delta')::int, c.hp_delta),
    will_delta   = COALESCE((_char->>'will_delta')::int, c.will_delta),
    per_delta    = COALESCE((_char->>'per_delta')::int, c.per_delta),
    fp_delta     = COALESCE((_char->>'fp_delta')::int, c.fp_delta),
    speed_delta  = COALESCE((_char->>'speed_delta')::numeric, c.speed_delta),
    move_delta   = COALESCE((_char->>'move_delta')::int, c.move_delta),
    current_hp   = NULLIF(_char->>'current_hp','')::int,
    current_fp   = NULLIF(_char->>'current_fp','')::int,
    conditions   = COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(COALESCE(_char->'conditions','[]'::jsonb)) AS value), '{}'::text[]),
    wealth       = COALESCE(_char->>'wealth', c.wealth),
    status       = COALESCE((_char->>'status')::int, c.status),
    appearance   = COALESCE(_char->'appearance', c.appearance),
    notes        = _char->>'notes',
    is_npc       = COALESCE((_char->>'is_npc')::boolean, c.is_npc),
    is_template  = COALESCE((_char->>'is_template')::boolean, c.is_template),
    gm_notes     = _char->>'gm_notes',
    portrait_path = _char->>'portrait_path',
    packs        = COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(COALESCE(_char->'packs','[]'::jsonb)) AS value), '{}'::text[]),
    model_path   = _char->>'model_path',
    model_transform = COALESCE(_char->'model_transform', c.model_transform),
    updated_at   = now()
  WHERE c.id = _ver.character_id
  RETURNING * INTO _row;

  DELETE FROM public.character_entries WHERE character_id = _ver.character_id;

  INSERT INTO public.character_entries
    (character_id, kind, name, category, points, levels, data, notes, source, sort_order)
  SELECT
    _ver.character_id,
    entry->>'kind',
    entry->>'name',
    entry->>'category',
    COALESCE((entry->>'points')::int, 0),
    COALESCE((entry->>'levels')::int, 1),
    COALESCE(entry->'data', '{}'::jsonb),
    entry->>'notes',
    COALESCE(entry->'source', '{}'::jsonb),
    COALESCE((entry->>'sort_order')::int, 0)
  FROM jsonb_array_elements(COALESCE(_snap->'entries', '[]'::jsonb)) AS entry;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_character_version(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.restore_character_version(uuid) TO authenticated;

-- 4. Runtime ammunition -----------------------------------------------------

CREATE OR REPLACE FUNCTION private.may_manage_character_runtime(_character uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = _character
      AND (
        c.owner_id = _user
        OR (c.campaign_id IS NOT NULL AND private.is_campaign_gm(c.campaign_id, _user))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.set_weapon_ammo(_entry uuid, _mode text, _shots integer)
RETURNS public.character_weapon_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _character uuid;
  _row public.character_weapon_state;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _shots < 0 THEN RAISE EXCEPTION 'current_shots must be 0 or more.'; END IF;

  SELECT character_id INTO _character FROM public.character_entries WHERE id = _entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'That sheet item was not found.'; END IF;
  IF NOT private.may_manage_character_runtime(_character, auth.uid()) THEN
    RAISE EXCEPTION 'Only the sheet owner or their campaign Game Master can change ammunition.';
  END IF;

  INSERT INTO public.character_weapon_state (character_id, character_entry_id, mode_key, current_shots)
  VALUES (_character, _entry, _mode, _shots)
  ON CONFLICT (character_id, character_entry_id, mode_key)
  DO UPDATE SET current_shots = EXCLUDED.current_shots, updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_weapon_ammo(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.set_weapon_ammo(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_weapon_ammo(_entry uuid, _mode text, _delta integer)
RETURNS public.character_weapon_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _character uuid;
  _row public.character_weapon_state;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT character_id INTO _character FROM public.character_entries WHERE id = _entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'That sheet item was not found.'; END IF;
  IF NOT private.may_manage_character_runtime(_character, auth.uid()) THEN
    RAISE EXCEPTION 'Only the sheet owner or their campaign Game Master can change ammunition.';
  END IF;

  INSERT INTO public.character_weapon_state (character_id, character_entry_id, mode_key, current_shots)
  VALUES (_character, _entry, _mode, GREATEST(0, _delta))
  ON CONFLICT (character_id, character_entry_id, mode_key)
  DO UPDATE SET
    current_shots = GREATEST(0, public.character_weapon_state.current_shots + _delta),
    updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_weapon_ammo(uuid, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.adjust_weapon_ammo(uuid, text, integer) TO authenticated;

-- 5. Atomic reveal / un-reveal ---------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_entity_knowledge(_entity uuid, _user uuid, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _row public.entities;
  _promoted text := NULL;
  _grant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _row FROM public.entities WHERE id = _entity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found.'; END IF;
  IF NOT private.is_campaign_gm(_row.campaign_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the campaign Game Master can reveal an entry.';
  END IF;
  IF _user = auth.uid() THEN
    RAISE EXCEPTION 'The Game Master already sees every entry.';
  END IF;
  IF NOT private.is_campaign_member(_row.campaign_id, _user) THEN
    RAISE EXCEPTION 'That person is not a member of this campaign.';
  END IF;

  IF _row.visibility IN ('GM_ONLY', 'UNREVEALED') THEN
    UPDATE public.entities SET visibility = 'SELECTED_PLAYERS', updated_at = now()
    WHERE id = _entity;
    _promoted := 'SELECTED_PLAYERS';
  END IF;

  INSERT INTO public.knowledge_grants (campaign_id, entity_id, user_id, note, granted_by)
  VALUES (_row.campaign_id, _entity, _user, _note, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING id INTO _grant;

  IF _grant IS NULL THEN
    SELECT id INTO _grant FROM public.knowledge_grants
    WHERE entity_id = _entity AND user_id = _user LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'grant_id', _grant,
    'entity_id', _entity,
    'user_id', _user,
    'promoted_to', _promoted,
    'visibility', COALESCE(_promoted, _row.visibility)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_entity_knowledge(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.grant_entity_knowledge(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_entity_knowledge(_grant uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _grant_row public.knowledge_grants;
  _row public.entities;
  _remaining int;
  _demoted boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _grant_row FROM public.knowledge_grants WHERE id = _grant;
  IF NOT FOUND THEN RAISE EXCEPTION 'That reveal was not found.'; END IF;
  IF NOT private.is_campaign_gm(_grant_row.campaign_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the campaign Game Master can take back a reveal.';
  END IF;

  DELETE FROM public.knowledge_grants WHERE id = _grant;

  SELECT count(*) INTO _remaining FROM public.knowledge_grants
  WHERE entity_id = _grant_row.entity_id;

  SELECT * INTO _row FROM public.entities WHERE id = _grant_row.entity_id;
  IF FOUND AND _remaining = 0 AND _row.visibility = 'SELECTED_PLAYERS' THEN
    UPDATE public.entities SET visibility = 'GM_ONLY', updated_at = now()
    WHERE id = _grant_row.entity_id;
    _demoted := true;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'id', _grant,
    'entity_id', _grant_row.entity_id,
    'user_id', _grant_row.user_id,
    'remaining_grants', _remaining,
    'demoted', _demoted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_entity_knowledge(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.revoke_entity_knowledge(uuid) TO authenticated;