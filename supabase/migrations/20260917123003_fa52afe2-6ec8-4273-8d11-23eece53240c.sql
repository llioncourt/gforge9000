-- ============================================================
-- Campaign Adaptation Studio — persistent model
-- ============================================================

CREATE TABLE public.adaptation_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scanning','reconstructing','reviewing','ready','generated','archived')),
  source_mode text NOT NULL DEFAULT 'mixed'
    CHECK (source_mode IN ('planned','played','mixed')),
  spoiler_policy text NOT NULL DEFAULT 'include_gm_truth'
    CHECK (spoiler_policy IN ('revealed_only','include_gm_truth','custom')),
  target_comic boolean NOT NULL DEFAULT true,
  target_movie boolean NOT NULL DEFAULT true,
  source_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  creative_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  wizard_step text NOT NULL DEFAULT 'source',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.adaptation_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adaptation_id uuid NOT NULL REFERENCES public.adaptation_projects(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid,
  source_key text NOT NULL,
  source_hash text NOT NULL,
  source_revision text,
  included boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adaptation_id, source_key)
);

CREATE TABLE public.adaptation_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adaptation_id uuid NOT NULL REFERENCES public.adaptation_projects(id) ON DELETE CASCADE,
  stable_key text NOT NULL,
  subject_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  fact_type text NOT NULL DEFAULT 'general',
  statement text NOT NULL,
  provenance_type text NOT NULL DEFAULT 'ai_inference'
    CHECK (provenance_type IN ('campaign_canon','session_derived','ai_inference','adaptation_created','conflict')),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  canon_status text NOT NULL DEFAULT 'needs_review'
    CHECK (canon_status IN ('confirmed','needs_review','rejected')),
  conflict_with jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  gm_only boolean NOT NULL DEFAULT true,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adaptation_id, stable_key)
);

CREATE TABLE public.adaptation_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adaptation_id uuid NOT NULL REFERENCES public.adaptation_projects(id) ON DELETE CASCADE,
  stable_key text NOT NULL,
  sequence_no integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  synopsis text NOT NULL DEFAULT '',
  dramatic_goal text NOT NULL DEFAULT '',
  story_beats jsonb NOT NULL DEFAULT '[]'::jsonb,
  dialogue jsonb NOT NULL DEFAULT '[]'::jsonb,
  narration jsonb NOT NULL DEFAULT '[]'::jsonb,
  cast_entity_ids uuid[] NOT NULL DEFAULT '{}',
  location_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  prop_entity_ids uuid[] NOT NULL DEFAULT '{}',
  wardrobe_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  continuity_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  knowledge_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance_type text NOT NULL DEFAULT 'ai_inference'
    CHECK (provenance_type IN ('campaign_canon','session_derived','ai_inference','adaptation_created','conflict')),
  review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('confirmed','needs_review','rejected')),
  manually_edited boolean NOT NULL DEFAULT false,
  content_hash text NOT NULL DEFAULT '',
  gm_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adaptation_id, stable_key)
);

CREATE TABLE public.adaptation_asset_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adaptation_id uuid NOT NULL REFERENCES public.adaptation_projects(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_id uuid,
  canonical_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'reference'
    CHECK (role IN ('character','location','prop','wardrobe','map','reference','audio','video')),
  bucket text,
  storage_path text,
  media_type text,
  byte_size bigint,
  sha256 text,
  bundle_path text,
  target_hints jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_canonical boolean NOT NULL DEFAULT false,
  resolution_status text NOT NULL DEFAULT 'unresolved'
    CHECK (resolution_status IN ('resolved','unresolved','ambiguous','rejected')),
  suggested_by text NOT NULL DEFAULT 'explicit'
    CHECK (suggested_by IN ('explicit','ai','manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.adaptation_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adaptation_id uuid NOT NULL REFERENCES public.adaptation_projects(id) ON DELETE CASCADE,
  target_system text NOT NULL CHECK (target_system IN ('rx_comics','moviesmith')),
  target_project_external_id text,
  target_object_external_id text,
  last_sync_hash text,
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adaptation_id, target_system)
);

CREATE TABLE public.adaptation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adaptation_id uuid NOT NULL REFERENCES public.adaptation_projects(id) ON DELETE CASCADE,
  snapshot_hash text NOT NULL,
  source_hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.adaptation_change_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adaptation_id uuid NOT NULL REFERENCES public.adaptation_projects(id) ON DELETE CASCADE,
  from_snapshot_id uuid REFERENCES public.adaptation_snapshots(id) ON DELETE SET NULL,
  to_snapshot_id uuid REFERENCES public.adaptation_snapshots(id) ON DELETE SET NULL,
  added jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed jsonb NOT NULL DEFAULT '[]'::jsonb,
  removed jsonb NOT NULL DEFAULT '[]'::jsonb,
  impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Session chronicle
-- ============================================================

CREATE TABLE public.session_chronicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  session_no integer,
  played_on date,
  in_world_date jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','analyzed','approved')),
  prep_note_id uuid REFERENCES public.campaign_notes(id) ON DELETE SET NULL,
  recap_note_id uuid REFERENCES public.campaign_notes(id) ON DELETE SET NULL,
  transcript text NOT NULL DEFAULT '',
  raw_notes text NOT NULL DEFAULT '',
  approved_recap text NOT NULL DEFAULT '',
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.session_chronicle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chronicle_id uuid NOT NULL REFERENCES public.session_chronicles(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN (
    'actual_event','character_action','discovery','dialogue_highlight',
    'consequence','canon_change','ai_reconstruction'
  )),
  sequence_no integer NOT NULL DEFAULT 0,
  summary text NOT NULL,
  detail text NOT NULL DEFAULT '',
  subject_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  provenance_type text NOT NULL DEFAULT 'ai_inference'
    CHECK (provenance_type IN ('campaign_canon','session_derived','ai_inference','adaptation_created','conflict')),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_status text NOT NULL DEFAULT 'needs_review'
    CHECK (review_status IN ('confirmed','needs_review','rejected')),
  gm_only boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX adaptation_projects_campaign_idx ON public.adaptation_projects(campaign_id, created_at DESC);
CREATE INDEX adaptation_sources_adaptation_idx ON public.adaptation_sources(adaptation_id);
CREATE INDEX adaptation_facts_adaptation_idx ON public.adaptation_facts(adaptation_id, provenance_type);
CREATE INDEX adaptation_scenes_adaptation_idx ON public.adaptation_scenes(adaptation_id, sequence_no);
CREATE INDEX adaptation_asset_links_adaptation_idx ON public.adaptation_asset_links(adaptation_id, role);
CREATE INDEX adaptation_asset_links_sha_idx ON public.adaptation_asset_links(adaptation_id, sha256);
CREATE INDEX adaptation_targets_adaptation_idx ON public.adaptation_targets(adaptation_id);
CREATE INDEX adaptation_snapshots_adaptation_idx ON public.adaptation_snapshots(adaptation_id, created_at DESC);
CREATE INDEX adaptation_change_sets_adaptation_idx ON public.adaptation_change_sets(adaptation_id, created_at DESC);
CREATE INDEX session_chronicles_campaign_idx ON public.session_chronicles(campaign_id, session_no);
CREATE INDEX session_chronicle_items_chronicle_idx ON public.session_chronicle_items(chronicle_id, item_type, sequence_no);

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_facts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_scenes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_asset_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adaptation_change_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_chronicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_chronicle_items TO authenticated;

GRANT ALL ON public.adaptation_projects TO service_role;
GRANT ALL ON public.adaptation_sources TO service_role;
GRANT ALL ON public.adaptation_facts TO service_role;
GRANT ALL ON public.adaptation_scenes TO service_role;
GRANT ALL ON public.adaptation_asset_links TO service_role;
GRANT ALL ON public.adaptation_targets TO service_role;
GRANT ALL ON public.adaptation_snapshots TO service_role;
GRANT ALL ON public.adaptation_change_sets TO service_role;
GRANT ALL ON public.session_chronicles TO service_role;
GRANT ALL ON public.session_chronicle_items TO service_role;

-- ============================================================
-- Helper: is this adaptation owned by a campaign the caller GMs?
-- ============================================================

CREATE OR REPLACE FUNCTION private.can_manage_adaptation(_adaptation uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.adaptation_projects p
    WHERE p.id = _adaptation
      AND private.is_campaign_gm_member(p.campaign_id, _user)
  )
$$;

COMMENT ON FUNCTION private.can_manage_adaptation(uuid, uuid) IS
  'True when _user is the GM (owner or co-GM) of the campaign owning the adaptation. Scoped strictly by the passed _user.';

-- ============================================================
-- RLS — every adaptation table is GM-only
-- ============================================================

ALTER TABLE public.adaptation_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_asset_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_change_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_chronicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_chronicle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY adaptation_projects_all ON public.adaptation_projects
  FOR ALL TO authenticated
  USING (private.is_campaign_gm_member(campaign_id, auth.uid()))
  WITH CHECK (private.is_campaign_gm_member(campaign_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY adaptation_sources_all ON public.adaptation_sources
  FOR ALL TO authenticated
  USING (private.can_manage_adaptation(adaptation_id, auth.uid()))
  WITH CHECK (private.can_manage_adaptation(adaptation_id, auth.uid()));

CREATE POLICY adaptation_facts_all ON public.adaptation_facts
  FOR ALL TO authenticated
  USING (private.can_manage_adaptation(adaptation_id, auth.uid()))
  WITH CHECK (private.can_manage_adaptation(adaptation_id, auth.uid()));

CREATE POLICY adaptation_scenes_all ON public.adaptation_scenes
  FOR ALL TO authenticated
  USING (private.can_manage_adaptation(adaptation_id, auth.uid()))
  WITH CHECK (private.can_manage_adaptation(adaptation_id, auth.uid()));

CREATE POLICY adaptation_asset_links_all ON public.adaptation_asset_links
  FOR ALL TO authenticated
  USING (private.can_manage_adaptation(adaptation_id, auth.uid()))
  WITH CHECK (private.can_manage_adaptation(adaptation_id, auth.uid()));

CREATE POLICY adaptation_targets_all ON public.adaptation_targets
  FOR ALL TO authenticated
  USING (private.can_manage_adaptation(adaptation_id, auth.uid()))
  WITH CHECK (private.can_manage_adaptation(adaptation_id, auth.uid()));

CREATE POLICY adaptation_snapshots_all ON public.adaptation_snapshots
  FOR ALL TO authenticated
  USING (private.can_manage_adaptation(adaptation_id, auth.uid()))
  WITH CHECK (private.can_manage_adaptation(adaptation_id, auth.uid()));

CREATE POLICY adaptation_change_sets_all ON public.adaptation_change_sets
  FOR ALL TO authenticated
  USING (private.can_manage_adaptation(adaptation_id, auth.uid()))
  WITH CHECK (private.can_manage_adaptation(adaptation_id, auth.uid()));

CREATE POLICY session_chronicles_all ON public.session_chronicles
  FOR ALL TO authenticated
  USING (private.is_campaign_gm_member(campaign_id, auth.uid()))
  WITH CHECK (private.is_campaign_gm_member(campaign_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY session_chronicle_items_all ON public.session_chronicle_items
  FOR ALL TO authenticated
  USING (private.is_campaign_gm_member(campaign_id, auth.uid()))
  WITH CHECK (private.is_campaign_gm_member(campaign_id, auth.uid()));

-- ============================================================
-- updated_at triggers
-- ============================================================

CREATE TRIGGER adaptation_projects_updated_at BEFORE UPDATE ON public.adaptation_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER adaptation_sources_updated_at BEFORE UPDATE ON public.adaptation_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER adaptation_facts_updated_at BEFORE UPDATE ON public.adaptation_facts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER adaptation_scenes_updated_at BEFORE UPDATE ON public.adaptation_scenes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER adaptation_asset_links_updated_at BEFORE UPDATE ON public.adaptation_asset_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER adaptation_targets_updated_at BEFORE UPDATE ON public.adaptation_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER adaptation_change_sets_updated_at BEFORE UPDATE ON public.adaptation_change_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER session_chronicles_updated_at BEFORE UPDATE ON public.session_chronicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER session_chronicle_items_updated_at BEFORE UPDATE ON public.session_chronicle_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();