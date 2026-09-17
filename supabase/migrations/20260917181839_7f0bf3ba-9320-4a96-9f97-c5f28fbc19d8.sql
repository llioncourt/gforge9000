create or replace function private.can_read_map_image(_path text, _user uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select exists (
    select 1 from public.maps m
    where m.image_path = _path
      and (
        private.is_campaign_gm_member(m.campaign_id, _user)
        or (m.visible_to_players and private.is_campaign_member(m.campaign_id, _user))
      )
  );
$$;

comment on function private.can_read_map_image(text, uuid) is 'True when the user may download a stored map image: GM of the map campaign, or a member when the map is flagged visible to players.';

revoke all on function private.can_read_map_image(text, uuid) from anon;

drop policy if exists maps_img_select on storage.objects;
create policy maps_img_select on storage.objects for select to authenticated
using (
  bucket_id = 'maps'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or private.can_read_map_image(name, auth.uid())
  )
);

create or replace function private.can_read_lore_asset(_path text, _user uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  with parts as (
    select (storage.foldername(_path))[2] as campaign_text
  ), camp as (
    select case
      when (select campaign_text from parts) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((select campaign_text from parts))::uuid
    end as id
  )
  select case
    when (select id from camp) is null then false
    when private.is_campaign_gm_member((select id from camp), _user) then true
    when not private.is_campaign_member((select id from camp), _user) then false
    else
      exists (
        select 1 from public.campaign_assets a
        where a.storage_path = _path
          and a.campaign_id = (select id from camp)
          and a.visible_to_players
      )
      or exists (
        select 1 from public.entities e
        where e.image_url = _path
          and e.campaign_id = (select id from camp)
          and private.can_view_entity(e.id, _user)
      )
      or exists (
        select 1 from public.campaigns c
        where c.id = (select id from camp)
          and c.settings->>'cover_path' = _path
      )
  end;
$$;

comment on function private.can_read_lore_asset(text, uuid) is 'True when the user may download a lore/library file: GM of the campaign, or a member when the file is a library item shared with players, the image of an entity the member can view, or the campaign cover.';

revoke all on function private.can_read_lore_asset(text, uuid) from anon;

drop policy if exists lore_assets_select on storage.objects;
create policy lore_assets_select on storage.objects for select to authenticated
using (
  bucket_id = 'lore-assets'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or private.can_read_lore_asset(name, auth.uid())
  )
);