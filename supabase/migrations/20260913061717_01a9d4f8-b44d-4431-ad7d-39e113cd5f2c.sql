create or replace function public.transfer_character_owner(_character uuid, _new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _campaign uuid;
  _owner uuid;
  _name text;
begin
  select campaign_id, owner_id into _campaign, _owner
  from public.characters where id = _character;

  if _owner is null then
    raise exception 'Character not found';
  end if;

  if auth.uid() <> _owner
     and not (_campaign is not null and private.is_campaign_gm(_campaign)) then
    raise exception 'Only the owner or the campaign GM can transfer this character';
  end if;

  if _campaign is null then
    raise exception 'Character must belong to a campaign before transferring ownership';
  end if;

  if not exists (
    select 1 from public.campaign_members
    where campaign_id = _campaign and user_id = _new_owner
  ) then
    raise exception 'The new owner must be a member of this campaign';
  end if;

  select display_name into _name from public.profiles where id = _new_owner;

  update public.characters
  set owner_id = _new_owner,
      player_name = coalesce(_name, player_name),
      updated_at = now()
  where id = _character;
end;
$$;

revoke all on function public.transfer_character_owner(uuid, uuid) from public;
grant execute on function public.transfer_character_owner(uuid, uuid) to authenticated;