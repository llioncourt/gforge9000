-- NPC/entity photos live in the portraits bucket under <user id>/... . Let any
-- authenticated user view portraits uploaded by someone who shares a campaign
-- with them, so players can see NPC photos the GM uploaded.
CREATE POLICY portraits_select_campaign_members ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'portraits'
  AND EXISTS (
    SELECT 1
    FROM public.campaign_members mine
    JOIN public.campaign_members theirs ON theirs.campaign_id = mine.campaign_id
    WHERE mine.user_id = auth.uid()
      AND theirs.user_id::text = (storage.foldername(name))[1]
  )
);