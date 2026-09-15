alter table public.campaign_sound_fx add column if not exists sort_order integer not null default 0;

with ordered as (
  select id, row_number() over (order by created_at) - 1 as position
  from public.campaign_sound_fx
)
update public.campaign_sound_fx sfx
set sort_order = ordered.position
from ordered
where sfx.id = ordered.id;

create or replace function public.campaign_sound_fx_next_sort_order(campaign uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(sort_order), -1) + 1
  from public.campaign_sound_fx
  where campaign_id = campaign;
$$;

grant execute on function public.campaign_sound_fx_next_sort_order(uuid) to authenticated;

create index if not exists campaign_sound_fx_sort_idx on public.campaign_sound_fx(campaign_id, sort_order);