-- ===== helpers =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== profiles =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Adventurer',
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Adventurer'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== campaigns =====
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gm_id UUID NOT NULL DEFAULT auth.uid(),
  name TEXT NOT NULL,
  description TEXT,
  invite_code TEXT NOT NULL UNIQUE DEFAULT upper(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8)),
  settings JSONB NOT NULL DEFAULT '{"point_limit":150,"disadvantage_limit":-50,"quirk_limit":-5,"tech_level":8,"house_rules":"","allowed_packs":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.campaign_members (
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('gm','player')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_campaign_member(_campaign UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaign_members m WHERE m.campaign_id = _campaign AND m.user_id = _user);
$$;
CREATE OR REPLACE FUNCTION public.is_campaign_gm(_campaign UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = _campaign AND c.gm_id = _user);
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_select" ON public.campaigns FOR SELECT TO authenticated
  USING (gm_id = auth.uid() OR public.is_campaign_member(id, auth.uid()));
CREATE POLICY "campaigns_insert" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (gm_id = auth.uid());
CREATE POLICY "campaigns_update" ON public.campaigns FOR UPDATE TO authenticated USING (gm_id = auth.uid()) WITH CHECK (gm_id = auth.uid());
CREATE POLICY "campaigns_delete" ON public.campaigns FOR DELETE TO authenticated USING (gm_id = auth.uid());
CREATE TRIGGER campaigns_updated BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_members TO authenticated;
GRANT ALL ON public.campaign_members TO service_role;
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_select" ON public.campaign_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_campaign_gm(campaign_id, auth.uid()) OR public.is_campaign_member(campaign_id, auth.uid()));
CREATE POLICY "members_insert" ON public.campaign_members FOR INSERT TO authenticated
  WITH CHECK (public.is_campaign_gm(campaign_id, auth.uid()));
CREATE POLICY "members_delete" ON public.campaign_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_campaign_gm(campaign_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.join_campaign(_code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  SELECT id INTO _id FROM public.campaigns WHERE invite_code = upper(trim(_code));
  IF _id IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  INSERT INTO public.campaign_members (campaign_id, user_id, role)
  VALUES (_id, auth.uid(), 'player') ON CONFLICT DO NOTHING;
  RETURN _id;
END; $$;
GRANT EXECUTE ON FUNCTION public.join_campaign(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_gm_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.campaign_members (campaign_id, user_id, role)
  VALUES (NEW.id, NEW.gm_id, 'gm') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER campaigns_add_gm AFTER INSERT ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.add_gm_membership();

-- ===== characters =====
CREATE TABLE public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Unnamed Character',
  player_name TEXT,
  concept TEXT,
  point_budget INTEGER NOT NULL DEFAULT 150,
  tech_level INTEGER NOT NULL DEFAULT 8,
  st INTEGER NOT NULL DEFAULT 10,
  dx INTEGER NOT NULL DEFAULT 10,
  iq INTEGER NOT NULL DEFAULT 10,
  ht INTEGER NOT NULL DEFAULT 10,
  hp_delta INTEGER NOT NULL DEFAULT 0,
  will_delta INTEGER NOT NULL DEFAULT 0,
  per_delta INTEGER NOT NULL DEFAULT 0,
  fp_delta INTEGER NOT NULL DEFAULT 0,
  speed_delta NUMERIC NOT NULL DEFAULT 0,
  move_delta INTEGER NOT NULL DEFAULT 0,
  current_hp INTEGER,
  current_fp INTEGER,
  conditions TEXT[] NOT NULL DEFAULT '{}',
  wealth TEXT NOT NULL DEFAULT 'Average',
  status INTEGER NOT NULL DEFAULT 0,
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  is_npc BOOLEAN NOT NULL DEFAULT false,
  is_template BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  gm_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "characters_select" ON public.characters FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (campaign_id IS NOT NULL AND public.is_campaign_gm(campaign_id, auth.uid())));
CREATE POLICY "characters_insert" ON public.characters FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "characters_update" ON public.characters FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR (campaign_id IS NOT NULL AND public.is_campaign_gm(campaign_id, auth.uid())))
  WITH CHECK (owner_id = auth.uid() OR (campaign_id IS NOT NULL AND public.is_campaign_gm(campaign_id, auth.uid())));
CREATE POLICY "characters_delete" ON public.characters FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER characters_updated BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX characters_owner_idx ON public.characters(owner_id);
CREATE INDEX characters_campaign_idx ON public.characters(campaign_id);

CREATE OR REPLACE FUNCTION public.can_view_character(_character UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = _character
      AND (c.owner_id = _user OR (c.campaign_id IS NOT NULL AND public.is_campaign_gm(c.campaign_id, _user)))
  );
$$;
CREATE OR REPLACE FUNCTION public.owns_character(_character UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.characters c WHERE c.id = _character AND c.owner_id = _user);
$$;

-- ===== character entries =====
CREATE TABLE public.character_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('advantage','disadvantage','perk','quirk','skill','technique','spell','equipment','language','culture','custom')),
  name TEXT NOT NULL,
  category TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  levels INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_entries TO authenticated;
GRANT ALL ON public.character_entries TO service_role;
ALTER TABLE public.character_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entries_select" ON public.character_entries FOR SELECT TO authenticated USING (public.can_view_character(character_id, auth.uid()));
CREATE POLICY "entries_write" ON public.character_entries FOR INSERT TO authenticated WITH CHECK (public.can_view_character(character_id, auth.uid()));
CREATE POLICY "entries_update" ON public.character_entries FOR UPDATE TO authenticated USING (public.can_view_character(character_id, auth.uid())) WITH CHECK (public.can_view_character(character_id, auth.uid()));
CREATE POLICY "entries_delete" ON public.character_entries FOR DELETE TO authenticated USING (public.can_view_character(character_id, auth.uid()));
CREATE TRIGGER entries_updated BEFORE UPDATE ON public.character_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX entries_character_idx ON public.character_entries(character_id);

-- ===== versions =====
CREATE TABLE public.character_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  label TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.character_versions TO authenticated;
GRANT ALL ON public.character_versions TO service_role;
ALTER TABLE public.character_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "versions_select" ON public.character_versions FOR SELECT TO authenticated USING (public.can_view_character(character_id, auth.uid()));
CREATE POLICY "versions_insert" ON public.character_versions FOR INSERT TO authenticated WITH CHECK (public.can_view_character(character_id, auth.uid()));
CREATE POLICY "versions_delete" ON public.character_versions FOR DELETE TO authenticated USING (public.owns_character(character_id, auth.uid()));
CREATE INDEX versions_character_idx ON public.character_versions(character_id, created_at DESC);

-- ===== library =====
CREATE TABLE public.library_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL DEFAULT auth.uid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('advantage','disadvantage','perk','quirk','skill','technique','spell','equipment','language','culture','custom')),
  name TEXT NOT NULL,
  category TEXT,
  summary TEXT,
  base_points INTEGER NOT NULL DEFAULT 0,
  cost_per_level INTEGER NOT NULL DEFAULT 0,
  max_levels INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','campaign','public')),
  source_label TEXT NOT NULL DEFAULT 'User Content',
  source_edition TEXT,
  source_page TEXT,
  source_type TEXT NOT NULL DEFAULT 'user' CHECK (source_type IN ('user','community','licensed','official')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_entries TO authenticated;
GRANT ALL ON public.library_entries TO service_role;
ALTER TABLE public.library_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "library_select" ON public.library_entries FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR visibility = 'public' OR (visibility = 'campaign' AND campaign_id IS NOT NULL AND public.is_campaign_member(campaign_id, auth.uid())));
CREATE POLICY "library_insert" ON public.library_entries FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "library_update" ON public.library_entries FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "library_delete" ON public.library_entries FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER library_updated BEFORE UPDATE ON public.library_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX library_kind_idx ON public.library_entries(kind);

-- ===== campaign notes =====
CREATE TABLE public.campaign_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  author_id UUID NOT NULL DEFAULT auth.uid(),
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','handout','session','rule')),
  title TEXT NOT NULL,
  body TEXT,
  gm_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_notes TO authenticated;
GRANT ALL ON public.campaign_notes TO service_role;
ALTER TABLE public.campaign_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_select" ON public.campaign_notes FOR SELECT TO authenticated
  USING (public.is_campaign_gm(campaign_id, auth.uid()) OR (gm_only = false AND public.is_campaign_member(campaign_id, auth.uid())));
CREATE POLICY "notes_insert" ON public.campaign_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_campaign_member(campaign_id, auth.uid()));
CREATE POLICY "notes_update" ON public.campaign_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_campaign_gm(campaign_id, auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.is_campaign_gm(campaign_id, auth.uid()));
CREATE POLICY "notes_delete" ON public.campaign_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_campaign_gm(campaign_id, auth.uid()));
CREATE TRIGGER campaign_notes_updated BEFORE UPDATE ON public.campaign_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== roll history =====
CREATE TABLE public.roll_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid(),
  character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  expression TEXT NOT NULL,
  dice INTEGER[] NOT NULL DEFAULT '{}',
  total INTEGER NOT NULL,
  target INTEGER,
  margin INTEGER,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.roll_history TO authenticated;
GRANT ALL ON public.roll_history TO service_role;
ALTER TABLE public.roll_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rolls_select" ON public.roll_history FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (campaign_id IS NOT NULL AND public.is_campaign_gm(campaign_id, auth.uid())));
CREATE POLICY "rolls_insert" ON public.roll_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "rolls_delete" ON public.roll_history FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX rolls_user_idx ON public.roll_history(user_id, created_at DESC);