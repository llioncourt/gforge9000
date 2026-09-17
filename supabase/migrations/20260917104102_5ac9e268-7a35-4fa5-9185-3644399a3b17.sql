create or replace function private.is_campaign_gm_member(_campaign uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.campaigns c where c.id = _campaign and c.gm_id = _user
  ) or exists (
    select 1 from public.campaign_members m
    where m.campaign_id = _campaign and m.user_id = _user and m.role = 'gm'
  );
$$;

comment on function private.is_campaign_gm_member(uuid, uuid) is 'True when the user owns the campaign or is a member with the gm role. Scoped strictly by the passed _user.';

drop policy if exists notifications_insert on public.notifications;

create policy notifications_insert on public.notifications
  for insert to authenticated with check (
    created_by = auth.uid()
    and campaign_id is not null
    and private.is_campaign_gm_member(campaign_id, auth.uid())
  );