CREATE OR REPLACE FUNCTION public.remove_character_from_campaign(_character uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _campaign uuid;
  _owner uuid;
BEGIN
  SELECT c.campaign_id, c.owner_id INTO _campaign, _owner
  FROM public.characters c
  WHERE c.id = _character;

  IF NOT FOUND OR _campaign IS NULL THEN
    RETURN;
  END IF;

  IF _owner <> auth.uid()
     AND NOT private.is_campaign_gm(_campaign, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to remove this character from the campaign';
  END IF;

  UPDATE public.characters SET campaign_id = NULL WHERE id = _character;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_character_from_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_character_from_campaign(uuid) TO authenticated;