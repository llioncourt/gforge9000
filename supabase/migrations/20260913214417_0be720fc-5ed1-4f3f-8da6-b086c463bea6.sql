create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  entity_id uuid references public.entities(id) on delete cascade,
  kind text not null default 'reveal',
  title text not null,
  body text,
  read_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notifications_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());

create policy notifications_insert on public.notifications
  for insert to authenticated with check (
    created_by = auth.uid()
    and campaign_id is not null
    and private.is_campaign_gm(campaign_id, auth.uid())
  );

alter publication supabase_realtime add table public.notifications;