
revoke all on function public.transfer_campaign_gm(uuid, uuid) from public, anon;
grant execute on function public.transfer_campaign_gm(uuid, uuid) to authenticated;
revoke all on function private.can_view_map(uuid, uuid) from public, anon;
revoke all on function private.can_view_entity(uuid, uuid) from public, anon;
revoke all on function private.has_knowledge(uuid, uuid) from public, anon;
revoke all on function private.pack_shared_with(text, uuid, uuid) from public, anon;
grant execute on function private.can_view_map(uuid, uuid) to authenticated;
grant execute on function private.can_view_entity(uuid, uuid) to authenticated;
grant execute on function private.has_knowledge(uuid, uuid) to authenticated;
grant execute on function private.pack_shared_with(text, uuid, uuid) to authenticated;
