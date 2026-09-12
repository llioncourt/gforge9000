
create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null default 'Battle map',
  image_path text,
  grid_type text not null default 'square',
  grid_size numeric not null default 50,
  grid_offset_x numeric not null default 0,
  grid_offset_y numeric not null default 0,
  unit_per_cell numeric not null default 1,
  unit_name text not null default 'yd',
  image_width numeric,
  image_height numeric,
  is_active boolean not null default false,
  visible_to_players boolean not null default false,
  fog jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.map_objects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  map_id uuid not null references public.maps(id) on delete cascade,
  kind text not null default 'token',
  label text not null default '',
  character_id uuid references public.characters(id) on delete set null,
  owner_user_id uuid,
  x numeric not null default 0,
  y numeric not null default 0,
  size numeric not null default 1,
  rotation numeric not null default 0,
  color text,
  image_url text,
  hidden boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_campaign_idx on public.maps(campaign_id);
create index if not exists map_objects_map_idx on public.map_objects(map_id);

grant select, insert, update, delete on public.maps to authenticated;
grant all on public.maps to service_role;
grant select, insert, update, delete on public.map_objects to authenticated;
grant all on public.map_objects to service_role;

alter table public.maps enable row level security;
alter table public.map_objects enable row level security;

create or replace function private.can_view_map(_map uuid, _user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.maps m
    where m.id = _map
      and (private.is_campaign_gm(m.campaign_id, _user)
           or (m.visible_to_players and private.is_campaign_member(m.campaign_id, _user)))
  );
$$;

drop policy if exists maps_select on public.maps;
create policy maps_select on public.maps for select to authenticated
using (private.is_campaign_gm(campaign_id, auth.uid())
       or (visible_to_players and private.is_campaign_member(campaign_id, auth.uid())));

drop policy if exists maps_write on public.maps;
create policy maps_write on public.maps for all to authenticated
using (private.is_campaign_gm(campaign_id, auth.uid()))
with check (private.is_campaign_gm(campaign_id, auth.uid()));

drop policy if exists map_objects_select on public.map_objects;
create policy map_objects_select on public.map_objects for select to authenticated
using (private.is_campaign_gm(campaign_id, auth.uid())
       or (private.can_view_map(map_id, auth.uid()) and not hidden));

drop policy if exists map_objects_write on public.map_objects;
create policy map_objects_write on public.map_objects for all to authenticated
using (private.is_campaign_gm(campaign_id, auth.uid()))
with check (private.is_campaign_gm(campaign_id, auth.uid()));

drop policy if exists map_objects_move on public.map_objects;
create policy map_objects_move on public.map_objects for update to authenticated
using (
  not hidden
  and private.can_view_map(map_id, auth.uid())
  and (owner_user_id = auth.uid() or (character_id is not null and private.owns_character(character_id, auth.uid())))
)
with check (
  private.can_view_map(map_id, auth.uid())
  and (owner_user_id = auth.uid() or (character_id is not null and private.owns_character(character_id, auth.uid())))
);

drop trigger if exists maps_updated_at on public.maps;
create trigger maps_updated_at before update on public.maps
for each row execute function public.update_updated_at_column();
drop trigger if exists map_objects_updated_at on public.map_objects;
create trigger map_objects_updated_at before update on public.map_objects
for each row execute function public.update_updated_at_column();

alter table public.maps replica identity full;
alter table public.map_objects replica identity full;
alter publication supabase_realtime add table public.maps;
alter publication supabase_realtime add table public.map_objects;

drop policy if exists maps_img_select on storage.objects;
create policy maps_img_select on storage.objects for select to authenticated
using (
  bucket_id = 'maps'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and private.is_campaign_member(((storage.foldername(name))[2])::uuid, auth.uid())
    )
  )
);

drop policy if exists maps_img_insert on storage.objects;
create policy maps_img_insert on storage.objects for insert to authenticated
with check (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists maps_img_update on storage.objects;
create policy maps_img_update on storage.objects for update to authenticated
using (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists maps_img_delete on storage.objects;
create policy maps_img_delete on storage.objects for delete to authenticated
using (bucket_id = 'maps' and (storage.foldername(name))[1] = auth.uid()::text);
