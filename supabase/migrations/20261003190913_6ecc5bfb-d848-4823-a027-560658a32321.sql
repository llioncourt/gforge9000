CREATE OR REPLACE FUNCTION public.list_campaign_roster_cards(_campaign uuid)
RETURNS TABLE (
  id uuid,
  campaign_id uuid,
  owner_id uuid,
  name text,
  player_name text,
  portrait_path text,
  is_npc boolean,
  approved boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    c.id,
    c.campaign_id,
    c.owner_id,
    c.name,
    c.player_name,
    c.portrait_path,
    c.is_npc,
    c.approved
  FROM public.characters c
  WHERE c.campaign_id = _campaign
    AND c.approved = true
    AND c.is_npc = false
    AND (
      private.is_campaign_member(_campaign, auth.uid())
      OR private.is_campaign_gm(_campaign, auth.uid())
    )
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.list_campaign_roster_cards(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_campaign_roster_cards(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS portraits_select_campaign_roster ON storage.objects;
CREATE POLICY portraits_select_campaign_roster
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'portraits'
  AND EXISTS (
    SELECT 1
    FROM public.characters c
    WHERE c.portrait_path = storage.objects.name
      AND c.approved = true
      AND c.is_npc = false
      AND c.campaign_id IS NOT NULL
      AND (
        private.is_campaign_member(c.campaign_id, auth.uid())
        OR private.is_campaign_gm(c.campaign_id, auth.uid())
      )
  )
);