REVOKE EXECUTE ON FUNCTION public.rotate_campaign_invite(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_entity_revision(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_character_version(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_weapon_ammo(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.adjust_weapon_ammo(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.grant_entity_knowledge(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_entity_knowledge(uuid) FROM anon;