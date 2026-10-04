-- Read-path access rules without a function call per row, private Story notes
-- for their author, and a direct list of library pack names.
--
-- Every statement is idempotent. The four SELECT policies below grant exactly
-- the same rows as before, with one intended addition on campaign_notes: the
-- author of a note can always read it (so a player can keep a private note).
--
-- Why: the previous policies called a SECURITY DEFINER function for every row
-- scanned (and re-read the JWT claims each time). The helpers below return the
-- caller's campaigns / characters / shared packs ONCE per statement, and the
-- policies test membership in that set.

-- ---------------------------------------------------------------------------
-- 1. Set-returning helpers (evaluated once per statement)
-- ---------------------------------------------------------------------------

create or replace function private.gm_campaign_ids(_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select c.id from public.campaigns c where c.gm_id = _user;
$$;

create or replace function private.member_campaign_ids(_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select m.campaign_id from public.campaign_members m where m.user_id = _user;
$$;

-- Same rule as private.can_view_character: the owner, or the GM of the
-- character's campaign.
create or replace function private.viewable_character_ids(_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select c.id
  from public.characters c
  where c.owner_id = _user
     or (
       c.campaign_id is not null
       and c.campaign_id in (select g.id from public.campaigns g where g.gm_id = _user)
     );
$$;

-- Same rule as private.pack_shared_with, as the set of (pack, owner) pairs the
-- viewer can read: packs allowed by a campaign the viewer belongs to, owned by
-- that campaign's GM or by one of its members.
create or replace function private.shared_pack_keys(_viewer uuid)
returns table (pack_key text, owner_id uuid)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct lower(btrim(ap.value)), o.owner_id
  from public.campaigns c
  join public.campaign_members mv on mv.campaign_id = c.id and mv.user_id = _viewer
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(c.settings -> 'allowed_packs') = 'array'
         then c.settings -> 'allowed_packs' else '[]'::jsonb end
  ) as ap(value)
  cross join lateral (
    select c.gm_id as owner_id
    union
    select mo.user_id from public.campaign_members mo where mo.campaign_id = c.id
  ) o
  where o.owner_id is not null;
$$;

revoke all on function private.gm_campaign_ids(uuid) from public, anon;
revoke all on function private.member_campaign_ids(uuid) from public, anon;
revoke all on function private.viewable_character_ids(uuid) from public, anon;
revoke all on function private.shared_pack_keys(uuid) from public, anon;
grant execute on function private.gm_campaign_ids(uuid) to authenticated, service_role;
grant execute on function private.member_campaign_ids(uuid) to authenticated, service_role;
grant execute on function private.viewable_character_ids(uuid) to authenticated, service_role;
grant execute on function private.shared_pack_keys(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Equivalence guard: abort the whole migration if, for any existing user,
--    the new rules would show a different set of rows than the current ones.
-- ---------------------------------------------------------------------------

do $$
declare
  u record;
  diff bigint;
begin
  for u in select id from auth.users loop
    select count(*) into diff from public.characters c
    where (c.owner_id = u.id or (c.campaign_id is not null and private.is_campaign_gm(c.campaign_id, u.id)))
      is distinct from
          (c.owner_id = u.id or (c.campaign_id is not null and c.campaign_id in (select private.gm_campaign_ids(u.id))));
    if diff <> 0 then raise exception 'characters_select would change % row(s) for user %', diff, u.id; end if;

    select count(*) into diff from public.character_entries e
    where private.can_view_character(e.character_id, u.id)
      is distinct from (e.character_id in (select private.viewable_character_ids(u.id)));
    if diff <> 0 then raise exception 'entries_select would change % row(s) for user %', diff, u.id; end if;

    select count(*) into diff from public.library_entries l
    where (
            l.owner_id = u.id
            or l.visibility = 'public'
            or (l.visibility = 'campaign' and l.campaign_id is not null and private.is_campaign_member(l.campaign_id, u.id))
            or private.pack_shared_with(l.pack, l.owner_id, u.id)
          )
      is distinct from
          (
            l.owner_id = u.id
            or l.visibility = 'public'
            or (l.visibility = 'campaign' and l.campaign_id is not null and l.campaign_id in (select private.member_campaign_ids(u.id)))
            or (
              l.pack is not null and btrim(l.pack) <> ''
              and (lower(btrim(l.pack)), l.owner_id) in (select s.pack_key, s.owner_id from private.shared_pack_keys(u.id) s)
            )
          );
    if diff <> 0 then raise exception 'library_select would change % row(s) for user %', diff, u.id; end if;

    -- Notes: nothing visible today may disappear, and anything newly visible
    -- must be a note the user wrote in a campaign they belong to.
    select count(*) into diff from public.campaign_notes n
    where (
            private.is_campaign_gm(n.campaign_id, u.id)
            or (n.gm_only = false and private.is_campaign_member(n.campaign_id, u.id))
          )
      is distinct from
          (
            n.campaign_id in (select private.gm_campaign_ids(u.id))
            or (n.gm_only = false and n.campaign_id in (select private.member_campaign_ids(u.id)))
          );
    if diff <> 0 then raise exception 'notes_select would change % row(s) for user %', diff, u.id; end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. SELECT policies
-- ---------------------------------------------------------------------------

drop policy if exists "characters_select" on public.characters;
create policy "characters_select" on public.characters for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      campaign_id is not null
      and campaign_id in (select private.gm_campaign_ids((select auth.uid())))
    )
  );

drop policy if exists "entries_select" on public.character_entries;
create policy "entries_select" on public.character_entries for select to authenticated
  using (character_id in (select private.viewable_character_ids((select auth.uid()))));

drop policy if exists "library_select" on public.library_entries;
create policy "library_select" on public.library_entries for select to authenticated
  using (
    owner_id = (select auth.uid())
    or visibility = 'public'
    or (
      visibility = 'campaign'
      and campaign_id is not null
      and campaign_id in (select private.member_campaign_ids((select auth.uid())))
    )
    or (
      pack is not null
      and btrim(pack) <> ''
      and (lower(btrim(pack)), owner_id) in (
        select s.pack_key, s.owner_id from private.shared_pack_keys((select auth.uid())) s
      )
    )
  );

-- Story notes: the GM reads everything in their campaign, members read what is
-- not GM-only, and the author always reads their own note while they are a
-- member. That last rule is what makes a player's private note possible:
-- `gm_only = true` on a player's note means "only me and the GM".
drop policy if exists "notes_select" on public.campaign_notes;
create policy "notes_select" on public.campaign_notes for select to authenticated
  using (
    campaign_id in (select private.gm_campaign_ids((select auth.uid())))
    or (
      gm_only = false
      and campaign_id in (select private.member_campaign_ids((select auth.uid())))
    )
    or (
      author_id = (select auth.uid())
      and campaign_id in (select private.member_campaign_ids((select auth.uid())))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Library pack names in one call (row policies still apply: invoker rights)
-- ---------------------------------------------------------------------------

create or replace function public.list_library_pack_names()
returns setof text
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select distinct l.pack
  from public.library_entries l
  where l.pack is not null and l.pack <> ''
  order by 1;
$$;

revoke all on function public.list_library_pack_names() from public, anon;
grant execute on function public.list_library_pack_names() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Rollback (the SELECT policies exactly as they were before this migration)
-- ---------------------------------------------------------------------------
-- drop policy if exists "characters_select" on public.characters;
-- create policy "characters_select" on public.characters for select to authenticated
--   using ((owner_id = auth.uid()) or ((campaign_id is not null) and private.is_campaign_gm(campaign_id, auth.uid())));
-- drop policy if exists "entries_select" on public.character_entries;
-- create policy "entries_select" on public.character_entries for select to authenticated
--   using (private.can_view_character(character_id, auth.uid()));
-- drop policy if exists "library_select" on public.library_entries;
-- create policy "library_select" on public.library_entries for select to authenticated
--   using ((owner_id = auth.uid()) or (visibility = 'public') or ((visibility = 'campaign') and (campaign_id is not null) and private.is_campaign_member(campaign_id, auth.uid())) or private.pack_shared_with(pack, owner_id, auth.uid()));
-- drop policy if exists "notes_select" on public.campaign_notes;
-- create policy "notes_select" on public.campaign_notes for select to authenticated
--   using (private.is_campaign_gm(campaign_id, auth.uid()) or ((gm_only = false) and private.is_campaign_member(campaign_id, auth.uid())));
