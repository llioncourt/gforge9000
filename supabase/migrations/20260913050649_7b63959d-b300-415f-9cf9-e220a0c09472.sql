create table public.campaign_soundtrack_albums (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  slug text not null,
  title text not null,
  subtitle text,
  description text,
  composer text,
  release_year integer,
  cover_path text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, slug),
  constraint campaign_soundtrack_album_slug_check check (slug ~ '^[a-z0-9-]{2,80}$'),
  constraint campaign_soundtrack_album_year_check check (release_year is null or release_year between 1970 and 2100)
);
grant select, insert, update, delete on public.campaign_soundtrack_albums to authenticated;
grant all on public.campaign_soundtrack_albums to service_role;
alter table public.campaign_soundtrack_albums enable row level security;
create policy campaign_soundtrack_albums_read on public.campaign_soundtrack_albums for select to authenticated using (private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_soundtrack_albums_write on public.campaign_soundtrack_albums for all to authenticated using (private.is_campaign_gm(campaign_id, auth.uid())) with check (private.is_campaign_gm(campaign_id, auth.uid()) and created_by = auth.uid());

create table public.campaign_soundtrack_tracks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  album_id uuid not null references public.campaign_soundtrack_albums(id) on delete cascade,
  position integer not null,
  title text not null,
  composer text,
  duration_seconds integer,
  storage_path text not null,
  file_name text not null,
  byte_size bigint not null,
  mime_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, position),
  constraint campaign_soundtrack_track_position_check check (position between 1 and 60),
  constraint campaign_soundtrack_track_duration_check check (duration_seconds is null or duration_seconds between 1 and 3600),
  constraint campaign_soundtrack_track_size_check check (byte_size > 0 and byte_size <= 41943040)
);
grant select, insert, update, delete on public.campaign_soundtrack_tracks to authenticated;
grant all on public.campaign_soundtrack_tracks to service_role;
alter table public.campaign_soundtrack_tracks enable row level security;
create policy campaign_soundtrack_tracks_read on public.campaign_soundtrack_tracks for select to authenticated using (private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_soundtrack_tracks_write on public.campaign_soundtrack_tracks for all to authenticated using (private.is_campaign_gm(campaign_id, auth.uid())) with check (private.is_campaign_gm(campaign_id, auth.uid()));

create table public.campaign_soundtrack_state (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  album_id uuid references public.campaign_soundtrack_albums(id) on delete set null,
  track_id uuid references public.campaign_soundtrack_tracks(id) on delete set null,
  is_playing boolean not null default false,
  position_seconds numeric not null default 0,
  changed_at timestamptz not null default now(),
  changed_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint campaign_soundtrack_position_check check (position_seconds >= 0)
);
grant select, insert, update, delete on public.campaign_soundtrack_state to authenticated;
grant all on public.campaign_soundtrack_state to service_role;
alter table public.campaign_soundtrack_state enable row level security;
create policy campaign_soundtrack_state_read on public.campaign_soundtrack_state for select to authenticated using (private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_soundtrack_state_write on public.campaign_soundtrack_state for all to authenticated using (private.is_campaign_gm(campaign_id, auth.uid())) with check (private.is_campaign_gm(campaign_id, auth.uid()) and changed_by = auth.uid());

create index campaign_soundtrack_albums_campaign_idx on public.campaign_soundtrack_albums(campaign_id, created_at);
create index campaign_soundtrack_tracks_album_idx on public.campaign_soundtrack_tracks(album_id, position);

drop trigger if exists campaign_soundtrack_albums_updated_at on public.campaign_soundtrack_albums;
create trigger campaign_soundtrack_albums_updated_at before update on public.campaign_soundtrack_albums for each row execute function public.update_updated_at_column();
drop trigger if exists campaign_soundtrack_tracks_updated_at on public.campaign_soundtrack_tracks;
create trigger campaign_soundtrack_tracks_updated_at before update on public.campaign_soundtrack_tracks for each row execute function public.update_updated_at_column();
drop trigger if exists campaign_soundtrack_state_updated_at on public.campaign_soundtrack_state;
create trigger campaign_soundtrack_state_updated_at before update on public.campaign_soundtrack_state for each row execute function public.update_updated_at_column();

alter table public.campaign_soundtrack_state replica identity full;
alter publication supabase_realtime add table public.campaign_soundtrack_state;

drop policy if exists campaign_soundtracks_select on storage.objects;
create policy campaign_soundtracks_select on storage.objects for select to authenticated using (
  bucket_id = 'campaign-soundtracks'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_member(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_soundtracks_insert on storage.objects;
create policy campaign_soundtracks_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'campaign-soundtracks'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_soundtracks_update on storage.objects;
create policy campaign_soundtracks_update on storage.objects for update to authenticated using (
  bucket_id = 'campaign-soundtracks'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
) with check (
  bucket_id = 'campaign-soundtracks'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_soundtracks_delete on storage.objects;
create policy campaign_soundtracks_delete on storage.objects for delete to authenticated using (
  bucket_id = 'campaign-soundtracks'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);