
create or replace function private.shares_campaign(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _a = _b or exists (
    select 1 from public.campaign_members ma
    join public.campaign_members mb on mb.campaign_id = ma.campaign_id
    where ma.user_id = _a and mb.user_id = _b
  );
$$;

create or replace function private.can_view_character_portrait(_character uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.characters c
    where c.id = _character
      and (
        c.owner_id = _user
        or (c.campaign_id is not null and private.is_campaign_gm(c.campaign_id, _user))
        or (c.campaign_id is not null and c.approved and private.is_campaign_member(c.campaign_id, _user))
      )
  );
$$;

-- maps bucket: writes require campaign GM
drop policy if exists maps_img_insert on storage.objects;
create policy maps_img_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'maps'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);

drop policy if exists maps_img_update on storage.objects;
create policy maps_img_update on storage.objects for update to authenticated
using (
  bucket_id = 'maps'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
)
with check (
  bucket_id = 'maps'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);

drop policy if exists maps_img_delete on storage.objects;
create policy maps_img_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'maps'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (
    (storage.foldername(name))[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
  )
);

-- portraits: character-scoped visibility instead of any shared campaign
drop policy if exists portraits_select_campaign_members on storage.objects;
create policy portraits_select_campaign_members on storage.objects for select to authenticated
using (
  bucket_id = 'portraits'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.can_view_character_portrait(((storage.foldername(name))[2])::uuid, auth.uid())
);

-- profiles: only self or people sharing a campaign
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or private.shares_campaign(id, auth.uid()));
