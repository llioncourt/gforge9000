DROP POLICY IF EXISTS characters_delete ON public.characters;
CREATE POLICY characters_delete ON public.characters FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR (campaign_id IS NOT NULL AND private.is_campaign_gm(campaign_id, auth.uid())));