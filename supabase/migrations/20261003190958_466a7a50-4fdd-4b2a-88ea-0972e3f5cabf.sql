DROP POLICY IF EXISTS portraits_select_campaign_roster ON storage.objects;
REVOKE ALL ON FUNCTION public.list_campaign_roster_cards(uuid) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.list_campaign_roster_cards(uuid);