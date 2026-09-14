alter table public.campaign_intro_views drop constraint if exists campaign_intro_views_member_fk;
alter table public.campaign_intros rename to campaign_videos;
alter table public.campaign_videos drop constraint if exists campaign_intros_pkey;
alter table public.campaign_videos add column id uuid not null default gen_random_uuid();
alter table public.campaign_videos add column title text;
alter table public.campaign_videos add column video_type text not null default 'intro';
update public.campaign_videos set title = regexp_replace(file_name, '\\.[^.]+$', '') where title is null;
alter table public.campaign_videos alter column title set not null;
alter table public.campaign_videos add constraint campaign_videos_pkey primary key (id);
alter table public.campaign_videos add constraint campaign_videos_type_check check (video_type in ('intro','recap','cutscene','trailer','handout','vision','dream','other'));
create unique index campaign_videos_one_intro_idx on public.campaign_videos(campaign_id) where video_type = 'intro';
create index campaign_videos_campaign_idx on public.campaign_videos(campaign_id, created_at);

create table public.campaign_sound_fx (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  storage_path text not null,
  file_name text not null,
  byte_size bigint not null,
  mime_type text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_sound_fx_title_check check (char_length(title) between 1 and 160),
  constraint campaign_sound_fx_size_check check (byte_size > 0 and byte_size <= 41943040),
  constraint campaign_sound_fx_mime_check check (mime_type in ('audio/mpeg','audio/ogg','audio/opus','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/webm'))
);
grant select, insert, update, delete on public.campaign_sound_fx to authenticated;
grant all on public.campaign_sound_fx to service_role;
alter table public.campaign_sound_fx enable row level security;
create policy campaign_sound_fx_read on public.campaign_sound_fx for select to authenticated using (private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_sound_fx_insert on public.campaign_sound_fx for insert to authenticated with check (private.is_campaign_gm(campaign_id, auth.uid()) and created_by = auth.uid());
create policy campaign_sound_fx_update on public.campaign_sound_fx for update to authenticated using (private.is_campaign_gm(campaign_id, auth.uid())) with check (private.is_campaign_gm(campaign_id, auth.uid()) and created_by = auth.uid());
create policy campaign_sound_fx_delete on public.campaign_sound_fx for delete to authenticated using (private.is_campaign_gm(campaign_id, auth.uid()));

create table public.campaign_sound_fx_state (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  effect_id uuid references public.campaign_sound_fx(id) on delete set null,
  event_id uuid not null default gen_random_uuid(),
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now()
);
grant select, insert, update, delete on public.campaign_sound_fx_state to authenticated;
grant all on public.campaign_sound_fx_state to service_role;
alter table public.campaign_sound_fx_state enable row level security;
create policy campaign_sound_fx_state_read on public.campaign_sound_fx_state for select to authenticated using (private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_sound_fx_state_write on public.campaign_sound_fx_state for all to authenticated using (private.is_campaign_gm(campaign_id, auth.uid())) with check (private.is_campaign_gm(campaign_id, auth.uid()) and changed_by = auth.uid());

create index campaign_sound_fx_campaign_idx on public.campaign_sound_fx(campaign_id, created_at);
create trigger campaign_sound_fx_updated_at before update on public.campaign_sound_fx for each row execute function public.update_updated_at_column();
alter table public.campaign_sound_fx_state replica identity full;
alter publication supabase_realtime add table public.campaign_sound_fx_state;

drop policy if exists campaign_sound_fx_storage_select on storage.objects;
create policy campaign_sound_fx_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'campaign-sound-fx'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_member(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_sound_fx_storage_insert on storage.objects;
create policy campaign_sound_fx_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'campaign-sound-fx'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_sound_fx_storage_update on storage.objects;
create policy campaign_sound_fx_storage_update on storage.objects for update to authenticated using (
  bucket_id = 'campaign-sound-fx'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
) with check (
  bucket_id = 'campaign-sound-fx'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_sound_fx_storage_delete on storage.objects;
create policy campaign_sound_fx_storage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'campaign-sound-fx'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);