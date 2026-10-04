import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/hooks";
import { campaignIntroUrl, campaignVideoTypeLabel, listCampaignVideos } from "@/lib/campaign-intro";
import { getCampaignVideoPlayback, setCampaignVideoPlayback } from "@/lib/campaign-video-playback";
import { derivePlaybackPosition, shouldCorrectDrift } from "@/lib/playback-anchor";
import { useCampaignSoundtrackOptional } from "@/components/campaign/campaign-soundtrack-context";

/**
 * Shared video playback commanded by the Game Master.
 *
 * The campaign screen subscribes to the campaign's playback row and mirrors it
 * onto a single <video> element: the position always comes from the stored
 * anchor, and small differences are left alone so the picture does not stutter.
 * While a commanded video plays, the soundtrack steps aside and comes back from
 * the same point afterwards.
 */
export function CampaignVideoStage({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("media");
  const queryClient = useQueryClient();
  const soundtrack = useCampaignSoundtrackOptional();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  const playback = useQuery({
    queryKey: ["campaign-video-playback", campaignId],
    queryFn: () => getCampaignVideoPlayback(campaignId),
  });
  const videos = useQuery({
    queryKey: ["campaign-videos", campaignId],
    queryFn: () => listCampaignVideos(campaignId),
  });

  const state = playback.data ?? null;
  const video = videos.data?.find((item) => item.id === state?.video_id) ?? null;
  const active =
    !!state?.video_id && !!video && (state.is_playing || state.anchor_position_seconds > 0);

  useEffect(() => {
    const channel = supabase
      .channel(`video-playback:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "campaign_video_playback",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () =>
          void queryClient.invalidateQueries({
            queryKey: ["campaign-video-playback", campaignId],
          }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [campaignId, queryClient]);

  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!video?.storage_path) return;
    void campaignIntroUrl(video.storage_path).then((value) => {
      if (live) setUrl(value);
    });
    return () => {
      live = false;
    };
  }, [video?.storage_path]);

  // The soundtrack pauses locally while a commanded video is on screen.
  useEffect(() => {
    soundtrack?.setVideoActive(active && !!state?.is_playing);
    return () => soundtrack?.setVideoActive(false);
  }, [active, state?.is_playing, soundtrack?.setVideoActive]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !state || !url) return;
    const target = derivePlaybackPosition(
      state,
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null,
    );
    if (shouldCorrectDrift(el.currentTime, target)) el.currentTime = target;
    if (state.is_playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [url, state?.is_playing, state?.anchored_at, state?.anchor_position_seconds]);

  if (!active || !video || !url) return null;

  return (
    <Dialog open>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-5xl p-3 sm:p-5"
        // Only the Game Master decides when the shared video closes.
        onEscapeKeyDown={(event) => {
          if (!isGm) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate">{video.title}</DialogTitle>
          <DialogDescription>{campaignVideoTypeLabel(video.video_type)}</DialogDescription>
        </DialogHeader>
        <video
          ref={videoRef}
          src={url}
          playsInline
          controls={isGm}
          preload="auto"
          className="aspect-video w-full bg-background object-contain"
          aria-label={t("videos.playAria", { title: video.title })}
          onLoadedMetadata={() => {
            const el = videoRef.current;
            if (!el || !state) return;
            const target = derivePlaybackPosition(state, el.duration || null);
            if (shouldCorrectDrift(el.currentTime, target)) el.currentTime = target;
          }}
          onEnded={() => {
            if (state?.loop_one) {
              const el = videoRef.current;
              if (el) {
                el.currentTime = 0;
                void el.play().catch(() => undefined);
              }
              return;
            }
            // Only the GM writes: otherwise every viewer would race to stop it.
            if (isGm)
              void setCampaignVideoPlayback({
                campaignId,
                videoId: state?.video_id ?? null,
                isPlaying: false,
                positionSeconds: 0,
                loopOne: false,
              });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export default CampaignVideoStage;
