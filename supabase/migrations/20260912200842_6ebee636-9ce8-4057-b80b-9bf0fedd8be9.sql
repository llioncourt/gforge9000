CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  summary text,
  player_description text,
  description text,
  gm_notes text,
  status text NOT NULL DEFAULT 'ACTIVE',
  visibility text NOT NULL DEFAULT 'GM_ONLY',
  parent_id uuid REFERENCES public.entities ON DELETE SET NULL,
  owner_user_id uuid,
  character_id uuid REFERENCES public.characters ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  image_url text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  canon_locked boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entities_campaign_kind_idx ON public.entities (campaign_id, kind);
CREATE INDEX entities_campaign_parent_idx ON public.entities (campaign_id, parent_id);
CREATE INDEX entities_campaign_updated_idx ON public.entities (campaign_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;

CREATE TABLE public.knowledge_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities ON DELETE CASCADE,
  user_id uuid NOT NULL,
  note text,
  granted_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, user_id)
);
CREATE INDEX knowledge_grants_campaign_user_idx ON public.knowledge_grants (campaign_id, user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_grants TO authenticated;
GRANT ALL ON public.knowledge_grants TO service_role;

CREATE OR REPLACE FUNCTION private.has_knowledge(_entity uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.knowledge_grants g WHERE g.entity_id = _entity AND g.user_id = _user);
$$;

CREATE OR REPLACE FUNCTION private.can_view_entity(_entity uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.id = _entity
      AND (
        private.is_campaign_gm(e.campaign_id, _user)
        OR (private.is_campaign_member(e.campaign_id, _user) AND (
              e.visibility IN ('ALL_PLAYERS','PUBLIC')
              OR e.owner_user_id = _user
              OR (e.visibility = 'SELECTED_PLAYERS' AND private.has_knowledge(e.id, _user))
           ))
      )
  );
$$;

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY entities_select ON public.entities FOR SELECT TO authenticated USING (
  private.is_campaign_gm(campaign_id, auth.uid())
  OR (private.is_campaign_member(campaign_id, auth.uid()) AND (
        visibility IN ('ALL_PLAYERS','PUBLIC')
        OR owner_user_id = auth.uid()
        OR (visibility = 'SELECTED_PLAYERS' AND private.has_knowledge(id, auth.uid()))
     ))
);
CREATE POLICY entities_insert ON public.entities FOR INSERT TO authenticated WITH CHECK (private.is_campaign_gm(campaign_id, auth.uid()));
CREATE POLICY entities_update ON public.entities FOR UPDATE TO authenticated USING (private.is_campaign_gm(campaign_id, auth.uid()) OR owner_user_id = auth.uid());
CREATE POLICY entities_delete ON public.entities FOR DELETE TO authenticated USING (private.is_campaign_gm(campaign_id, auth.uid()));

ALTER TABLE public.knowledge_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_grants_select ON public.knowledge_grants FOR SELECT TO authenticated USING (private.is_campaign_gm(campaign_id, auth.uid()) OR user_id = auth.uid());
CREATE POLICY knowledge_grants_write ON public.knowledge_grants FOR ALL TO authenticated USING (private.is_campaign_gm(campaign_id, auth.uid())) WITH CHECK (private.is_campaign_gm(campaign_id, auth.uid()));

CREATE TABLE public.entity_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.entities ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.entities ON DELETE CASCADE,
  rel_type text NOT NULL,
  description text,
  gm_description text,
  visibility text NOT NULL DEFAULT 'GM_ONLY',
  strength integer,
  is_current boolean NOT NULL DEFAULT true,
  start_label text,
  end_label text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entity_relationships_campaign_idx ON public.entity_relationships (campaign_id);
CREATE INDEX entity_relationships_source_idx ON public.entity_relationships (source_id);
CREATE INDEX entity_relationships_target_idx ON public.entity_relationships (target_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_relationships TO authenticated;
GRANT ALL ON public.entity_relationships TO service_role;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY entity_relationships_select ON public.entity_relationships FOR SELECT TO authenticated USING (
  private.is_campaign_gm(campaign_id, auth.uid())
  OR (private.is_campaign_member(campaign_id, auth.uid()) AND visibility IN ('ALL_PLAYERS','PUBLIC'))
);
CREATE POLICY entity_relationships_write ON public.entity_relationships FOR ALL TO authenticated USING (private.is_campaign_gm(campaign_id, auth.uid())) WITH CHECK (private.is_campaign_gm(campaign_id, auth.uid()));

CREATE TABLE public.entity_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities ON DELETE CASCADE,
  label text,
  snapshot jsonb NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entity_revisions_entity_idx ON public.entity_revisions (entity_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_revisions TO authenticated;
GRANT ALL ON public.entity_revisions TO service_role;
ALTER TABLE public.entity_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY entity_revisions_select ON public.entity_revisions FOR SELECT TO authenticated USING (private.can_view_entity(entity_id, auth.uid()));
CREATE POLICY entity_revisions_insert ON public.entity_revisions FOR INSERT TO authenticated WITH CHECK (private.can_view_entity(entity_id, auth.uid()));
CREATE POLICY entity_revisions_delete ON public.entity_revisions FOR DELETE TO authenticated USING (private.is_campaign_gm(campaign_id, auth.uid()));

CREATE TRIGGER entities_updated_at BEFORE UPDATE ON public.entities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER entity_relationships_updated_at BEFORE UPDATE ON public.entity_relationships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();