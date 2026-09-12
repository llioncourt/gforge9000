CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_campaign_member(_campaign UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaign_members m WHERE m.campaign_id = _campaign AND m.user_id = _user);
$$;
CREATE OR REPLACE FUNCTION private.is_campaign_gm(_campaign UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = _campaign AND c.gm_id = _user);
$$;
CREATE OR REPLACE FUNCTION private.can_view_character(_character UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = _character
      AND (c.owner_id = _user OR (c.campaign_id IS NOT NULL AND private.is_campaign_gm(c.campaign_id, _user)))
  );
$$;
CREATE OR REPLACE FUNCTION private.owns_character(_character UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.characters c WHERE c.id = _character AND c.owner_id = _user);
$$;
GRANT EXECUTE ON FUNCTION private.is_campaign_member(UUID,UUID), private.is_campaign_gm(UUID,UUID), private.can_view_character(UUID,UUID), private.owns_character(UUID,UUID) TO authenticated, service_role;

DROP POLICY "campaigns_select" ON public.campaigns;
CREATE POLICY "campaigns_select" ON public.campaigns FOR SELECT TO authenticated
  USING (gm_id = auth.uid() OR private.is_campaign_member(id, auth.uid()));

DROP POLICY "members_select" ON public.campaign_members;
CREATE POLICY "members_select" ON public.campaign_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_campaign_gm(campaign_id, auth.uid()) OR private.is_campaign_member(campaign_id, auth.uid()));
DROP POLICY "members_insert" ON public.campaign_members;
CREATE POLICY "members_insert" ON public.campaign_members FOR INSERT TO authenticated
  WITH CHECK (private.is_campaign_gm(campaign_id, auth.uid()));
DROP POLICY "members_delete" ON public.campaign_members;
CREATE POLICY "members_delete" ON public.campaign_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR private.is_campaign_gm(campaign_id, auth.uid()));

DROP POLICY "characters_select" ON public.characters;
CREATE POLICY "characters_select" ON public.characters FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR (campaign_id IS NOT NULL AND private.is_campaign_gm(campaign_id, auth.uid())));
DROP POLICY "characters_update" ON public.characters;
CREATE POLICY "characters_update" ON public.characters FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR (campaign_id IS NOT NULL AND private.is_campaign_gm(campaign_id, auth.uid())))
  WITH CHECK (owner_id = auth.uid() OR (campaign_id IS NOT NULL AND private.is_campaign_gm(campaign_id, auth.uid())));

DROP POLICY "entries_select" ON public.character_entries;
CREATE POLICY "entries_select" ON public.character_entries FOR SELECT TO authenticated USING (private.can_view_character(character_id, auth.uid()));
DROP POLICY "entries_write" ON public.character_entries;
CREATE POLICY "entries_write" ON public.character_entries FOR INSERT TO authenticated WITH CHECK (private.can_view_character(character_id, auth.uid()));
DROP POLICY "entries_update" ON public.character_entries;
CREATE POLICY "entries_update" ON public.character_entries FOR UPDATE TO authenticated USING (private.can_view_character(character_id, auth.uid())) WITH CHECK (private.can_view_character(character_id, auth.uid()));
DROP POLICY "entries_delete" ON public.character_entries;
CREATE POLICY "entries_delete" ON public.character_entries FOR DELETE TO authenticated USING (private.can_view_character(character_id, auth.uid()));

DROP POLICY "versions_select" ON public.character_versions;
CREATE POLICY "versions_select" ON public.character_versions FOR SELECT TO authenticated USING (private.can_view_character(character_id, auth.uid()));
DROP POLICY "versions_insert" ON public.character_versions;
CREATE POLICY "versions_insert" ON public.character_versions FOR INSERT TO authenticated WITH CHECK (private.can_view_character(character_id, auth.uid()));
DROP POLICY "versions_delete" ON public.character_versions;
CREATE POLICY "versions_delete" ON public.character_versions FOR DELETE TO authenticated USING (private.owns_character(character_id, auth.uid()));

DROP POLICY "library_select" ON public.library_entries;
CREATE POLICY "library_select" ON public.library_entries FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR visibility = 'public' OR (visibility = 'campaign' AND campaign_id IS NOT NULL AND private.is_campaign_member(campaign_id, auth.uid())));

DROP POLICY "notes_select" ON public.campaign_notes;
CREATE POLICY "notes_select" ON public.campaign_notes FOR SELECT TO authenticated
  USING (private.is_campaign_gm(campaign_id, auth.uid()) OR (gm_only = false AND private.is_campaign_member(campaign_id, auth.uid())));
DROP POLICY "notes_insert" ON public.campaign_notes;
CREATE POLICY "notes_insert" ON public.campaign_notes FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND private.is_campaign_member(campaign_id, auth.uid()));
DROP POLICY "notes_update" ON public.campaign_notes;
CREATE POLICY "notes_update" ON public.campaign_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR private.is_campaign_gm(campaign_id, auth.uid()))
  WITH CHECK (author_id = auth.uid() OR private.is_campaign_gm(campaign_id, auth.uid()));
DROP POLICY "notes_delete" ON public.campaign_notes;
CREATE POLICY "notes_delete" ON public.campaign_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR private.is_campaign_gm(campaign_id, auth.uid()));

DROP POLICY "rolls_select" ON public.roll_history;
CREATE POLICY "rolls_select" ON public.roll_history FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (campaign_id IS NOT NULL AND private.is_campaign_gm(campaign_id, auth.uid())));

DROP FUNCTION IF EXISTS public.is_campaign_member(UUID,UUID);
DROP FUNCTION IF EXISTS public.is_campaign_gm(UUID,UUID);
DROP FUNCTION IF EXISTS public.can_view_character(UUID,UUID);
DROP FUNCTION IF EXISTS public.owns_character(UUID,UUID);

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_gm_membership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_campaign(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_campaign(TEXT) TO authenticated;