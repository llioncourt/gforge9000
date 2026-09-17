
-- 1. Explicit GM-only gate for adaptation facts/scenes
create or replace function private.is_adaptation_gm(_adaptation uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select exists (
    select 1 from public.adaptation_projects p
    where p.id = _adaptation and private.is_campaign_gm_member(p.campaign_id, _user)
  )
$$;

drop policy if exists adaptation_facts_all on public.adaptation_facts;
create policy adaptation_facts_select on public.adaptation_facts for select to authenticated
  using (private.is_adaptation_gm(adaptation_id, auth.uid()));
create policy adaptation_facts_insert on public.adaptation_facts for insert to authenticated
  with check (private.is_adaptation_gm(adaptation_id, auth.uid()));
create policy adaptation_facts_update on public.adaptation_facts for update to authenticated
  using (private.is_adaptation_gm(adaptation_id, auth.uid()))
  with check (private.is_adaptation_gm(adaptation_id, auth.uid()));
create policy adaptation_facts_delete on public.adaptation_facts for delete to authenticated
  using (private.is_adaptation_gm(adaptation_id, auth.uid()));

drop policy if exists adaptation_scenes_all on public.adaptation_scenes;
create policy adaptation_scenes_select on public.adaptation_scenes for select to authenticated
  using (private.is_adaptation_gm(adaptation_id, auth.uid()));
create policy adaptation_scenes_insert on public.adaptation_scenes for insert to authenticated
  with check (private.is_adaptation_gm(adaptation_id, auth.uid()));
create policy adaptation_scenes_update on public.adaptation_scenes for update to authenticated
  using (private.is_adaptation_gm(adaptation_id, auth.uid()))
  with check (private.is_adaptation_gm(adaptation_id, auth.uid()));
create policy adaptation_scenes_delete on public.adaptation_scenes for delete to authenticated
  using (private.is_adaptation_gm(adaptation_id, auth.uid()));

-- 2. Characters: campaign detach/reassign requires GM
drop policy if exists characters_update on public.characters;
create policy characters_update on public.characters for update to authenticated
  using ((owner_id = auth.uid()) or (campaign_id is not null and private.is_campaign_gm(campaign_id, auth.uid())))
  with check ((owner_id = auth.uid()) or (campaign_id is not null and private.is_campaign_gm(campaign_id, auth.uid())));

create or replace function public.guard_character_campaign_change()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  if new.campaign_id is distinct from old.campaign_id and old.campaign_id is not null then
    if not private.is_campaign_gm_member(old.campaign_id, auth.uid()) then
      raise exception 'Only the campaign GM can move or detach this character';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_character_campaign_change on public.characters;
create trigger guard_character_campaign_change
  before update on public.characters
  for each row execute function public.guard_character_campaign_change();

-- 3. Notifications: recipient must belong to the campaign
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (
    created_by = auth.uid()
    and campaign_id is not null
    and private.is_campaign_gm_member(campaign_id, auth.uid())
    and (
      user_id = auth.uid()
      or private.is_campaign_member(campaign_id, user_id)
      or private.is_campaign_gm_member(campaign_id, user_id)
    )
  );

-- 4. Session chronicle: GM-only rows restricted to GMs explicitly
drop policy if exists session_chronicle_items_all on public.session_chronicle_items;
create policy session_chronicle_items_select on public.session_chronicle_items for select to authenticated
  using (
    private.is_campaign_gm_member(campaign_id, auth.uid())
    or (gm_only = false and private.is_campaign_member(campaign_id, auth.uid()))
  );
create policy session_chronicle_items_insert on public.session_chronicle_items for insert to authenticated
  with check (private.is_campaign_gm_member(campaign_id, auth.uid()));
create policy session_chronicle_items_update on public.session_chronicle_items for update to authenticated
  using (private.is_campaign_gm_member(campaign_id, auth.uid()))
  with check (private.is_campaign_gm_member(campaign_id, auth.uid()));
create policy session_chronicle_items_delete on public.session_chronicle_items for delete to authenticated
  using (private.is_campaign_gm_member(campaign_id, auth.uid()));
