CREATE OR REPLACE FUNCTION public.restore_entity_revision(_revision uuid)
 RETURNS entities
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _rev public.entity_revisions;
  _snap jsonb;
  _row public.entities;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _rev FROM public.entity_revisions WHERE id = _revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saved version not found.'; END IF;
  IF NOT private.is_campaign_gm(_rev.campaign_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the campaign Game Master can restore a saved version.';
  END IF;

  _snap := _rev.snapshot;

  -- Identity, ownership and placement are NEVER taken from the snapshot:
  -- id, campaign_id, owner_user_id, character_id, parent_id and created_at
  -- always keep their current values. Only the mutable content below is
  -- restored.
  UPDATE public.entities e SET
    kind               = COALESCE(_snap->>'kind', e.kind),
    name               = COALESCE(_snap->>'name', e.name),
    aliases            = COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(COALESCE(_snap->'aliases','[]'::jsonb)) AS value), e.aliases),
    summary            = _snap->>'summary',
    player_description = _snap->>'player_description',
    description        = _snap->>'description',
    gm_notes           = _snap->>'gm_notes',
    status             = COALESCE(_snap->>'status', e.status),
    visibility         = COALESCE(_snap->>'visibility', e.visibility),
    tags               = COALESCE((SELECT array_agg(value::text) FROM jsonb_array_elements_text(COALESCE(_snap->'tags','[]'::jsonb)) AS value), e.tags),
    image_url          = _snap->>'image_url',
    data               = COALESCE(_snap->'data', e.data),
    sort_order         = COALESCE((_snap->>'sort_order')::int, e.sort_order),
    canon_locked       = COALESCE((_snap->>'canon_locked')::boolean, e.canon_locked),
    updated_at         = now()
  WHERE e.id = _rev.entity_id
  RETURNING * INTO _row;

  IF NOT FOUND THEN RAISE EXCEPTION 'The entry this version belongs to no longer exists.'; END IF;
  RETURN _row;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_entity_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_entity_revision(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_entity_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_entity_revision(uuid) TO service_role;