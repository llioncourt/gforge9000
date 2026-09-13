create table public.campaign_intros (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  byte_size bigint not null,
  mime_type text not null default 'video/mp4',
  version uuid not null default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_intro_size_check check (byte_size > 0 and byte_size <= 262144000),
  constraint campaign_intro_mime_check check (mime_type = 'video/mp4')
);
grant select, insert, update, delete on public.campaign_intros to authenticated;
grant all on public.campaign_intros to service_role;
alter table public.campaign_intros enable row level security;
create policy campaign_intros_read on public.campaign_intros for select to authenticated using (private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_intros_insert on public.campaign_intros for insert to authenticated with check (private.is_campaign_gm(campaign_id, auth.uid()) and created_by = auth.uid());
create policy campaign_intros_update on public.campaign_intros for update to authenticated using (private.is_campaign_gm(campaign_id, auth.uid())) with check (private.is_campaign_gm(campaign_id, auth.uid()) and created_by = auth.uid());
create policy campaign_intros_delete on public.campaign_intros for delete to authenticated using (private.is_campaign_gm(campaign_id, auth.uid()));

create table public.campaign_intro_views (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  intro_version uuid not null,
  completed_at timestamptz not null default now(),
  do_not_show_again boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id),
  constraint campaign_intro_views_member_fk foreign key (campaign_id) references public.campaign_intros(campaign_id) on delete cascade
);
grant select, insert, update, delete on public.campaign_intro_views to authenticated;
grant all on public.campaign_intro_views to service_role;
alter table public.campaign_intro_views enable row level security;
create policy campaign_intro_views_read_own on public.campaign_intro_views for select to authenticated using (user_id = auth.uid() and private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_intro_views_insert_own on public.campaign_intro_views for insert to authenticated with check (user_id = auth.uid() and private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_intro_views_update_own on public.campaign_intro_views for update to authenticated using (user_id = auth.uid() and private.is_campaign_member(campaign_id, auth.uid())) with check (user_id = auth.uid() and private.is_campaign_member(campaign_id, auth.uid()));
create policy campaign_intro_views_delete_own on public.campaign_intro_views for delete to authenticated using (user_id = auth.uid());

create trigger campaign_intros_updated_at before update on public.campaign_intros for each row execute function public.update_updated_at_column();
create trigger campaign_intro_views_updated_at before update on public.campaign_intro_views for each row execute function public.update_updated_at_column();

drop policy if exists campaign_intros_storage_select on storage.objects;
create policy campaign_intros_storage_select on storage.objects for select to authenticated using (
  bucket_id = 'campaign-intros'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_member(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_intros_storage_insert on storage.objects;
create policy campaign_intros_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'campaign-intros'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_intros_storage_update on storage.objects;
create policy campaign_intros_storage_update on storage.objects for update to authenticated using (
  bucket_id = 'campaign-intros'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
) with check (
  bucket_id = 'campaign-intros'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);
drop policy if exists campaign_intros_storage_delete on storage.objects;
create policy campaign_intros_storage_delete on storage.objects for delete to authenticated using (
  bucket_id = 'campaign-intros'
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_campaign_gm(((storage.foldername(name))[2])::uuid, auth.uid())
);