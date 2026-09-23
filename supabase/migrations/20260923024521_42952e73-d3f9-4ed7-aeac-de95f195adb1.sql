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
         e.player_description,
         CASE WHEN private.is_campaign_gm(e.campaign_id, auth.uid()) THEN e.description ELSE NULL END,
         CASE WHEN private.is_campaign_gm(e.campaign_id, auth.uid()) THEN e.gm_notes ELSE NULL END,
         e.status, e.visibility, e.parent_id, e.owner_user_id, e.character_id, e.tags, e.image_url,
         CASE WHEN private.is_campaign_gm(e.campaign_id, auth.uid()) THEN e.data
              ELSE e.data - private.gm_data_keys(e.kind) END,
         e.sort_order, e.canon_locked, e.archived_at, e.created_by, e.created_at, e.updated_at
  FROM public.entities e
  WHERE (_campaign IS NULL OR e.campaign_id = _campaign)
    AND private.can_view_entity(e.id, auth.uid());
$$;

COMMENT ON FUNCTION public.list_entities_safe(uuid) IS 'Audited read layer for entities: applies the same visibility rules as the base table RLS and redacts the GM-only full description, GM notes and GM-only data keys for non-GM callers.';

-- Version history holds full snapshots (description + gm_notes): GM only.
DROP POLICY IF EXISTS entity_revisions_select ON public.entity_revisions;
CREATE POLICY entity_revisions_select ON public.entity_revisions
  FOR SELECT TO authenticated
  USING (private.is_campaign_gm(campaign_id, auth.uid()));

-- Direct table reads carry unredacted GM text, so they are GM only.
-- Non-GM owners read their entries through public.list_entities_safe.
DROP POLICY IF EXISTS entities_select ON public.entities;
CREATE POLICY entities_select ON public.entities
  FOR SELECT TO authenticated
  USING (private.is_campaign_gm(campaign_id, auth.uid()));