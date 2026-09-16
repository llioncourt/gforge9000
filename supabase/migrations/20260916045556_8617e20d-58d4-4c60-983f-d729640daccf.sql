-- 1. Harden private helper functions: explicit, safe search_path + documentation
ALTER FUNCTION private.is_campaign_gm(uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.is_campaign_member(uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.can_view_character(uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.can_view_character_portrait(uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.can_view_entity(uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.can_view_map(uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.has_knowledge(uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.owns_character(uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.pack_shared_with(text, uuid, uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION private.shares_campaign(uuid, uuid) SET search_path TO 'public', 'pg_temp';

COMMENT ON FUNCTION private.is_campaign_gm(uuid, uuid) IS 'Audited: true only when _user is the campaigns.gm_id of _campaign.';
COMMENT ON FUNCTION private.is_campaign_member(uuid, uuid) IS 'Audited: true only when a campaign_members row links _campaign and _user.';
COMMENT ON FUNCTION private.can_view_entity(uuid, uuid) IS 'Audited: GM of the entity campaign, or a member when visibility is ALL_PLAYERS/PUBLIC, the member owns the entity, or an explicit knowledge grant exists.';
COMMENT ON FUNCTION private.can_view_character(uuid, uuid) IS 'Audited: character owner or the GM of the character campaign.';
COMMENT ON FUNCTION private.can_view_character_portrait(uuid, uuid) IS 'Audited: owner, campaign GM, or campaign member when the character is approved.';
COMMENT ON FUNCTION private.can_view_map(uuid, uuid) IS 'Audited: campaign GM, or campaign member when the map is flagged visible to players.';
COMMENT ON FUNCTION private.has_knowledge(uuid, uuid) IS 'Audited: an explicit knowledge_grants row exists for the entity/user pair.';
COMMENT ON FUNCTION private.owns_character(uuid, uuid) IS 'Audited: _user is characters.owner_id.';
COMMENT ON FUNCTION private.pack_shared_with(text, uuid, uuid) IS 'Audited: the viewer is a member of a campaign that (a) lists the pack in settings.allowed_packs and (b) has the pack owner as GM or member. Never grants cross-user access outside a shared campaign.';
COMMENT ON FUNCTION private.shares_campaign(uuid, uuid) IS 'Audited: same user, or both users are members of at least one shared campaign.';

-- 2. GM-only data keys per entity kind (mirrors src/lib/entity-kinds.ts fields flagged gm)
CREATE OR REPLACE FUNCTION private.gm_data_keys(_kind text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    (SELECT array_agg(v)
       FROM jsonb_array_elements_text(
         COALESCE(
           '{"NPC":["knowledge","secrets"],"PC":["gm_notes_pc"],"FACTION":["current_plans","secret_agenda"],"LOCATION":["secrets"],"ITEM":["secrets"],"CREATURE":["secrets"],"LORE":["secrets"],"ARC":["climax","possible_endings","consequences"],"ADVENTURE":["branching","gm_guidance"],"CHAPTER":["gm_guidance"],"SCENE":["gm_info","consequences"],"QUEST":["consequences","hidden_objectives"],"MYSTERY":["truth","false_leads","revelations"],"CLUE":["gm_interpretation"],"SECRET":["truth","reveal_conditions"],"CLOCK":["consequence"],"HANDOUT":["gm_original"],"EVENT":["gm_truth"]}'::jsonb -> _kind,
           '[]'::jsonb)) AS v),
    '{}'::text[]);
$$;

COMMENT ON FUNCTION private.gm_data_keys(text) IS 'GM-only keys inside entities.data for a given kind; stripped from player-facing reads.';

-- 3. Player-safe views that strip GM-only content before it leaves the database
CREATE OR REPLACE VIEW public.entities_safe AS
SELECT
  e.id,
  e.campaign_id,
  e.kind,
  e.name,
  e.aliases,
  e.summary,
  e.player_description,
  e.description,
  CASE WHEN private.is_campaign_gm(e.campaign_id, auth.uid()) THEN e.gm_notes ELSE NULL END AS gm_notes,
  e.status,
  e.visibility,
  e.parent_id,
  e.owner_user_id,
  e.character_id,
  e.tags,
  e.image_url,
  CASE WHEN private.is_campaign_gm(e.campaign_id, auth.uid())
       THEN e.data
       ELSE e.data - private.gm_data_keys(e.kind) END AS data,
  e.sort_order,
  e.canon_locked,
  e.archived_at,
  e.created_by,
  e.created_at,
  e.updated_at
FROM public.entities e
WHERE private.can_view_entity(e.id, auth.uid());

COMMENT ON VIEW public.entities_safe IS 'Player-safe read source for lore entities: applies the same visibility rules as the base table and removes GM-only notes and GM-only data keys for non-GM callers.';

CREATE OR REPLACE VIEW public.entity_relationships_safe AS
SELECT
  r.id,
  r.campaign_id,
  r.source_id,
  r.target_id,
  r.rel_type,
  r.description,
  CASE WHEN private.is_campaign_gm(r.campaign_id, auth.uid()) THEN r.gm_description ELSE NULL END AS gm_description,
  r.visibility,
  r.strength,
  r.is_current,
  r.start_label,
  r.end_label,
  r.created_by,
  r.created_at,
  r.updated_at
FROM public.entity_relationships r
WHERE private.is_campaign_gm(r.campaign_id, auth.uid())
   OR (private.is_campaign_member(r.campaign_id, auth.uid())
       AND r.visibility IN ('ALL_PLAYERS', 'PUBLIC'));

COMMENT ON VIEW public.entity_relationships_safe IS 'Player-safe read source for lore relationships: hides GM descriptions from non-GM callers.';

REVOKE ALL ON public.entities_safe FROM anon;
REVOKE ALL ON public.entity_relationships_safe FROM anon;
GRANT SELECT ON public.entities_safe TO authenticated;
GRANT SELECT ON public.entity_relationships_safe TO authenticated;
GRANT SELECT ON public.entities_safe TO service_role;
GRANT SELECT ON public.entity_relationships_safe TO service_role;

-- 4. Lock direct reads of the raw tables so GM text never reaches players
DROP POLICY IF EXISTS entities_select ON public.entities;
CREATE POLICY entities_select ON public.entities
  FOR SELECT TO authenticated
  USING (
    private.is_campaign_gm(campaign_id, auth.uid())
    OR owner_user_id = auth.uid()
  );

DROP POLICY IF EXISTS entity_relationships_select ON public.entity_relationships;
CREATE POLICY entity_relationships_select ON public.entity_relationships
  FOR SELECT TO authenticated
  USING (private.is_campaign_gm(campaign_id, auth.uid()));

-- 5. Explicit INSERT policy for sound effect playback state (GM only, self-attributed)
DROP POLICY IF EXISTS campaign_sound_fx_state_insert ON public.campaign_sound_fx_state;
CREATE POLICY campaign_sound_fx_state_insert ON public.campaign_sound_fx_state
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_campaign_gm(campaign_id, auth.uid())
    AND changed_by = auth.uid()
  );