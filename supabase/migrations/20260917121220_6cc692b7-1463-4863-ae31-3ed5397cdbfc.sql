
DROP VIEW IF EXISTS public.entities_safe;
DROP VIEW IF EXISTS public.entity_relationships_safe;

CREATE OR REPLACE FUNCTION public.list_entities_safe(_campaign uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, campaign_id uuid, kind text, name text, aliases text[], summary text,
  player_description text, description text, gm_notes text, status text, visibility text,
  parent_id uuid, owner_user_id uuid, character_id uuid, tags text[], image_url text,
  data jsonb, sort_order integer, canon_locked boolean, archived_at timestamptz,
  created_by uuid, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT e.id, e.campaign_id, e.kind, e.name, e.aliases, e.summary,
         e.player_description, e.description,
         CASE WHEN private.is_campaign_gm(e.campaign_id, auth.uid()) THEN e.gm_notes ELSE NULL END,
         e.status, e.visibility, e.parent_id, e.owner_user_id, e.character_id, e.tags, e.image_url,
         CASE WHEN private.is_campaign_gm(e.campaign_id, auth.uid()) THEN e.data
              ELSE e.data - private.gm_data_keys(e.kind) END,
         e.sort_order, e.canon_locked, e.archived_at, e.created_by, e.created_at, e.updated_at
  FROM public.entities e
  WHERE (_campaign IS NULL OR e.campaign_id = _campaign)
    AND private.can_view_entity(e.id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.list_relationships_safe(_campaign uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, campaign_id uuid, source_id uuid, target_id uuid, rel_type text, description text,
  gm_description text, visibility text, strength integer, is_current boolean,
  start_label text, end_label text, created_by uuid, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT r.id, r.campaign_id, r.source_id, r.target_id, r.rel_type, r.description,
         CASE WHEN private.is_campaign_gm(r.campaign_id, auth.uid()) THEN r.gm_description ELSE NULL END,
         r.visibility, r.strength, r.is_current, r.start_label, r.end_label,
         r.created_by, r.created_at, r.updated_at
  FROM public.entity_relationships r
  WHERE (_campaign IS NULL OR r.campaign_id = _campaign)
    AND (
      private.is_campaign_gm(r.campaign_id, auth.uid())
      OR (
        private.is_campaign_member(r.campaign_id, auth.uid())
        AND r.visibility IN ('ALL_PLAYERS', 'PUBLIC')
        AND private.can_view_entity(r.source_id, auth.uid())
        AND private.can_view_entity(r.target_id, auth.uid())
      )
    );
$$;

REVOKE ALL ON FUNCTION public.list_entities_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_relationships_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_entities_safe(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_relationships_safe(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_entities_safe(uuid) IS 'Audited read layer for entities: applies the same visibility rules as the base table RLS and redacts GM-only notes and GM-only data keys for non-GM callers.';
COMMENT ON FUNCTION public.list_relationships_safe(uuid) IS 'Audited read layer for entity relationships: GMs see everything; campaign members only see shared relationships between records they may view, with GM description redacted.';
