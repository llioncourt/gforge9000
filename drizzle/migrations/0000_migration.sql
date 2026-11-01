ALTER TABLE public.campaign_videos
  ADD COLUMN IF NOT EXISTS visible_to_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

DROP POLICY IF EXISTS campaign_intros_read ON public.campaign_videos;
CREATE POLICY campaign_intros_read ON public.campaign_videos
  FOR SELECT TO authenticated
  USING (
    private.is_campaign_gm(campaign_id, auth.uid())
    OR (
      private.is_campaign_member(campaign_id, auth.uid())
      AND (visible_to_players OR auth.uid() = ANY (visible_to_user_ids))
    )
  );