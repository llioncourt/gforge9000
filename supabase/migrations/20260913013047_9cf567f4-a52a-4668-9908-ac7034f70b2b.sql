create table if not exists public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null default 'Untitled',
  caption text,
  tags text[] not null default '{}',
  storage_path text not null,
  mime_type text not null default 'image/png',
  byte_size bigint not null default 0,
  width integer,
  height integer,
  visible_to_players boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_assets_campaign_idx on public.campaign_assets(campaign_id, created_at desc);

grant select, insert, update, delete on public.campaign_assets to authenticated;
grant all on public.campaign_assets to service_role;

alter table public.campaign_assets enable row level security;

drop policy if exists campaign_assets_select on public.campaign_assets;
create policy campaign_assets_select on public.campaign_assets for select to authenticated
using (
  private.is_campaign_gm(campaign_id, auth.uid())
  or (visible_to_players and private.is_campaign_member(campaign_id, auth.uid()))
);

drop policy if exists campaign_assets_insert on public.campaign_assets;
create policy campaign_assets_insert on public.campaign_assets for insert to authenticated
with check (private.is_campaign_gm(campaign_id, auth.uid()) and created_by = auth.uid());

drop policy if exists campaign_assets_update on public.campaign_assets;
create policy campaign_assets_update on public.campaign_assets for update to authenticated
using (private.is_campaign_gm(campaign_id, auth.uid()))
with check (private.is_campaign_gm(campaign_id, auth.uid()));

drop policy if exists campaign_assets_delete on public.campaign_assets;
create policy campaign_assets_delete on public.campaign_assets for delete to authenticated
using (private.is_campaign_gm(campaign_id, auth.uid()));

drop trigger if exists campaign_assets_updated_at on public.campaign_assets;
create trigger campaign_assets_updated_at before update on public.campaign_assets
for each row execute function public.update_updated_at_column();

drop policy if exists lore_assets_select on storage.objects;
create policy lore_assets_select on storage.objects for select to authenticated
using (
  bucket_id = 'lore-assets'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (
      (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and private.is_campaign_member(((storage.foldername(name))[2])::uuid, auth.uid())
    )
  )
);

drop policy if exists lore_assets_insert on storage.objects;
create policy lore_assets_insert on storage.objects for insert to authenticated
with check (bucket_id = 'lore-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists lore_assets_update on storage.objects;
create policy lore_assets_update on storage.objects for update to authenticated
using (bucket_id = 'lore-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists lore_assets_delete on storage.objects;
create policy lore_assets_delete on storage.objects for delete to authenticated
using (bucket_id = 'lore-assets' and (storage.foldername(name))[1] = auth.uid()::text);