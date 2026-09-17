REVOKE ALL ON FUNCTION public.transfer_character_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_character_owner(uuid, uuid) TO authenticated;