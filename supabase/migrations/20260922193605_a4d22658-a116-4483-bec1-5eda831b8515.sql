-- Narrow helpers backing the assistant's campaign tools.
-- 1) Shallow, first-level-only settings patch. Nested nulls survive; a
--    top-level null removes that key so the app falls back to its default.
create or replace function public.mcp_campaign_settings_patch(_settings jsonb, _patch jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce((
           select jsonb_object_agg(k, v)
           from jsonb_each(coalesce(_settings, '{}'::jsonb)) as kept(k, v)
           where not (coalesce(_patch, '{}'::jsonb) ? k)
         ), '{}'::jsonb)
         ||
         coalesce((
           select jsonb_object_agg(k, v)
           from jsonb_each(coalesce(_patch, '{}'::jsonb)) as applied(k, v)
           where v <> 'null'::jsonb
         ), '{}'::jsonb);
$$;

revoke all on function public.mcp_campaign_settings_patch(jsonb, jsonb) from public;
grant execute on function public.mcp_campaign_settings_patch(jsonb, jsonb) to authenticated, service_role;

-- 2) Create a campaign with the normal defaults, then apply the same
--    first-level settings patch inside one transaction.
create or replace function public.mcp_create_campaign(
  _name text,
  _description text default null,
  _settings_patch jsonb default '{}'::jsonb
)
returns public.campaigns
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  _row public.campaigns;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.campaigns (name, description, gm_id)
  values (_name, _description, auth.uid())
  returning * into _row;

  if coalesce(_settings_patch, '{}'::jsonb) <> '{}'::jsonb then
    update public.campaigns
       set settings = public.mcp_campaign_settings_patch(settings, _settings_patch)
     where id = _row.id
    returning * into _row;
  end if;

  return _row;
end;
$$;

revoke all on function public.mcp_create_campaign(text, text, jsonb) from public;
grant execute on function public.mcp_create_campaign(text, text, jsonb) to authenticated;

-- 3) Update name/description/settings atomically, first level only.
create or replace function public.mcp_update_campaign(
  _campaign uuid,
  _patch jsonb default '{}'::jsonb,
  _settings_patch jsonb default '{}'::jsonb
)
returns public.campaigns
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  _row public.campaigns;
begin
  select * into _row from public.campaigns where id = _campaign;
  if not found then
    raise exception 'Campaign not found, or you do not have access to it.';
  end if;
  if _row.gm_id is distinct from auth.uid() then
    raise exception 'Only the Game Master of "%" can change this campaign.', _row.name;
  end if;

  update public.campaigns
     set name        = case when coalesce(_patch, '{}'::jsonb) ? 'name'
                            then coalesce(_patch ->> 'name', name) else name end,
         description = case when coalesce(_patch, '{}'::jsonb) ? 'description'
                            then _patch ->> 'description' else description end,
         settings    = public.mcp_campaign_settings_patch(settings, coalesce(_settings_patch, '{}'::jsonb)),
         updated_at  = now()
   where id = _campaign
  returning * into _row;

  return _row;
end;
$$;

revoke all on function public.mcp_update_campaign(uuid, jsonb, jsonb) from public;
grant execute on function public.mcp_update_campaign(uuid, jsonb, jsonb) to authenticated;

-- 4) Permanent campaign deletion in one transaction, with an exact
--    case-sensitive name confirmation enforced inside the function itself.
create or replace function public.mcp_delete_campaign(_campaign uuid, _confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _row public.campaigns;
  _entries int;
  _relationships int;
  _deleted_characters int;
  _unlinked_characters int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into _row from public.campaigns where id = _campaign;
  if not found then
    raise exception 'Campaign not found, or you do not have access to it.';
  end if;
  if _row.gm_id is distinct from auth.uid() then
    raise exception 'Only the Game Master of "%" can delete this campaign.', _row.name;
  end if;
  if _confirm_name is distinct from _row.name then
    raise exception 'Confirmation name does not match. Expected: "%".', _row.name;
  end if;

  select count(*) into _entries from public.entities where campaign_id = _campaign;
  select count(*) into _relationships from public.entity_relationships where campaign_id = _campaign;
  select count(*) into _deleted_characters
    from public.characters where campaign_id = _campaign and owner_id = _row.gm_id;
  select count(*) into _unlinked_characters
    from public.characters where campaign_id = _campaign and owner_id <> _row.gm_id;

  -- The Game Master's own sheets go with the campaign.
  delete from public.characters where campaign_id = _campaign and owner_id = _row.gm_id;
  -- Everyone else keeps their sheet; it is detached while the campaign still
  -- exists so the existing character guard sees a legitimate Game Master move.
  update public.characters set campaign_id = null
   where campaign_id = _campaign and owner_id <> _row.gm_id;

  delete from public.campaigns where id = _campaign;

  return jsonb_build_object(
    'deleted', true,
    'id', _campaign,
    'entries_deleted', _entries,
    'relationships_deleted', _relationships,
    'characters_deleted', _deleted_characters,
    'characters_unlinked', _unlinked_characters
  );
end;
$$;

revoke all on function public.mcp_delete_campaign(uuid, text) from public;
grant execute on function public.mcp_delete_campaign(uuid, text) to authenticated;