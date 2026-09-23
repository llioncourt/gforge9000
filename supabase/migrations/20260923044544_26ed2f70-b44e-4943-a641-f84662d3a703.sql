ALTER TABLE public.campaign_soundtrack_state
  ADD COLUMN IF NOT EXISTS anchor_position_seconds numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anchored_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.campaign_soundtrack_state
  SET anchor_position_seconds = position_seconds, anchored_at = changed_at;

CREATE TABLE IF NOT EXISTS public.campaign_video_playback (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  video_id uuid REFERENCES public.campaign_videos(id) ON DELETE SET NULL,
  is_playing boolean NOT NULL DEFAULT false,
  anchor_position_seconds numeric NOT NULL DEFAULT 0,
  anchored_at timestamp with time zone NOT NULL DEFAULT now(),
  loop_one boolean NOT NULL DEFAULT false,
  changed_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_video_playback TO authenticated;
GRANT ALL ON public.campaign_video_playback TO service_role;

ALTER TABLE public.campaign_video_playback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read campaign video playback"
  ON public.campaign_video_playback FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaign_members m
    WHERE m.campaign_id = campaign_video_playback.campaign_id AND m.user_id = auth.uid()
  ));

CREATE POLICY "Game Masters control campaign video playback"
  ON public.campaign_video_playback FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_video_playback.campaign_id AND c.gm_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = campaign_video_playback.campaign_id AND c.gm_id = auth.uid()
  ));

CREATE TRIGGER update_campaign_video_playback_updated_at
  BEFORE UPDATE ON public.campaign_video_playback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.campaign_video_playback REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_video_playback;