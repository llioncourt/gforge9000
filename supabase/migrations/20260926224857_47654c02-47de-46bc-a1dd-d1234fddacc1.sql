create or replace function private.can_edit_character(_character uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.characters c where c.id = _character
    and (c.owner_id = _user or (c.campaign_id is not null and private.is_campaign_gm(c.campaign_id, _user))))
$$;

create or replace function private.can_hear_character(_character uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.characters c where c.id = _character
    and c.campaign_id is not null and private.is_campaign_member(c.campaign_id, _user))
$$;

create table public.character_voice_lines (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  label text check (label is null or char_length(label) <= 120),
  text text not null check (char_length(text) between 1 and 2500),
  audio_path text,
  audio_hash text,
  duration_seconds numeric,
  voice_id text,
  model_id text,
  voice_settings jsonb,
  position integer not null default 0,
  visible_to_players boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.character_voice_lines (character_id, position);

grant select, insert, update, delete on public.character_voice_lines to authenticated;
grant all on public.character_voice_lines to service_role;
alter table public.character_voice_lines enable row level security;

create policy "voice lines read" on public.character_voice_lines for select to authenticated
using (private.can_edit_character(character_id, auth.uid())
  or (visible_to_players and private.can_hear_character(character_id, auth.uid())));
create policy "voice lines insert" on public.character_voice_lines for insert to authenticated
with check (private.can_edit_character(character_id, auth.uid()) and created_by = auth.uid());
create policy "voice lines update" on public.character_voice_lines for update to authenticated
using (private.can_edit_character(character_id, auth.uid()))
with check (private.can_edit_character(character_id, auth.uid()));
create policy "voice lines delete" on public.character_voice_lines for delete to authenticated
using (private.can_edit_character(character_id, auth.uid()));

create trigger character_voice_lines_updated_at before update on public.character_voice_lines
for each row execute function public.update_updated_at_column();

create policy "voice audio read" on storage.objects for select to authenticated
using (bucket_id = 'character-voice-lines' and (
  private.can_edit_character(((storage.foldername(name))[1])::uuid, auth.uid())
  or exists (select 1 from public.character_voice_lines l where l.audio_path = name
    and l.visible_to_players and private.can_hear_character(l.character_id, auth.uid()))));
create policy "voice audio write" on storage.objects for insert to authenticated
with check (bucket_id = 'character-voice-lines'
  and private.can_edit_character(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy "voice audio update" on storage.objects for update to authenticated
using (bucket_id = 'character-voice-lines'
  and private.can_edit_character(((storage.foldername(name))[1])::uuid, auth.uid()));
create policy "voice audio delete" on storage.objects for delete to authenticated
using (bucket_id = 'character-voice-lines'
  and private.can_edit_character(((storage.foldername(name))[1])::uuid, auth.uid()));