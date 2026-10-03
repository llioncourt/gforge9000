import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Image as ImageIcon, LoaderCircle, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { VideoFramePicker } from "@/components/campaign/video-frame-picker";
import { useT } from "@/i18n/hooks";
import {
  CAMPAIGN_VIDEO_TYPES,
  campaignVideoThumbUrl,
  setCampaignVideoThumb,
  campaignIntroUrl,
  campaignVideoTypeLabel,
  getCampaignIntro,
  getMyCampaignIntroView,
  listCampaignVideos,
  removeCampaignVideo,
  saveCampaignIntroView,
  setCampaignVideoVisibility,
  shouldBlockForCampaignIntro,
  uploadCampaignVideo,
  type CampaignVideo,
  type CampaignVideoType,
} from "@/lib/campaign-intro";

function useFormatDuration() {
  const { t } = useT("media");
  return (seconds: number | null) => {
    if (seconds == null || !Number.isFinite(seconds)) return t("videos.durationUnavailable");
    const rounded = Math.round(seconds);
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainingSeconds = rounded % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
      : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  };
}

function VideoRow({
  video,
  isGm,
  onRemove,
}: {
  video: CampaignVideo;
  isGm: boolean;
  onRemove: (video: CampaignVideo) => void;
}) {
  const { t } = useT("media");
  const { t: tc } = useT("common");
  const formatDuration = useFormatDuration();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [thumbOpen, setThumbOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void campaignIntroUrl(video.storage_path).then((value) => {
      if (live) setUrl(value);
    });
    return () => {
      live = false;
    };
  }, [video.storage_path]);
  useEffect(() => {
    let live = true;
    setThumbUrl(null);
    if (video.thumb_path)
      void campaignVideoThumbUrl(video.thumb_path).then((value) => {
        if (live) setThumbUrl(value || null);
      });
    return () => {
      live = false;
    };
  }, [video.thumb_path]);
  const saveThumb = useMutation({
    mutationFn: (blob: Blob) => setCampaignVideoThumb(video, blob),
    onSuccess: async () => {
      setThumbOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["campaign-videos", video.campaign_id] });
      toast.success(t("videos.thumbnailUpdated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const saveVisibility = useMutation({
    mutationFn: (visible: boolean) => setCampaignVideoVisibility(video, visible),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaign-videos", video.campaign_id] });
      toast.success(t("videos.visibility.updated"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div data-search-id={video.id} className="panel flex items-center gap-3 p-3 sm:gap-4">
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md border border-border bg-background sm:w-40">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={t("videos.thumbnailEditAria", { title: video.title })}
            className="size-full object-cover"
          />
        ) : null}
        {url ? (
          <video
            src={url}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            className={thumbUrl ? "hidden" : "size-full object-cover"}
            aria-label={t("videos.thumbnailEditAria", { title: video.title })}
          />
        ) : thumbUrl ? null : (
          <Skeleton className="size-full rounded-none" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-background/20" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold sm:text-base">{video.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{campaignVideoTypeLabel(video.video_type)}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatDuration(duration)} ·{" "}
            {t("videos.sizeMb", { size: Math.ceil(video.byte_size / 1024 / 1024) })}
          </span>
          {isGm ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={video.visible_to_players}
                disabled={saveVisibility.isPending}
                onCheckedChange={(checked) => saveVisibility.mutate(checked)}
                aria-label={t("videos.visibility.label")}
              />
              {t("videos.visibility.label")}
            </label>
          ) : null}
        </div>
      </div>
      {url ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              type="button"
              size="icon"
              aria-label={t("videos.playAria", { title: video.title })}
            >
              <Play className="h-4 w-4 fill-current" />
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl p-3 sm:p-5">
            <DialogHeader className="pr-8">
              <DialogTitle className="truncate">{video.title}</DialogTitle>
              <DialogDescription>
                {t("videos.playDialog.description", {
                  type: campaignVideoTypeLabel(video.video_type),
                  duration: formatDuration(duration),
                })}
              </DialogDescription>
            </DialogHeader>
            <video
              src={url}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="aspect-video w-full bg-background object-contain"
              aria-label={t("videos.playAria", { title: video.title })}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      {isGm && url ? (
        <Dialog open={thumbOpen} onOpenChange={setThumbOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={t("videos.thumbnailEditAria", { title: video.title })}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t("videos.thumbnailDialog.title")}</DialogTitle>
              <DialogDescription>{t("videos.thumbnailDialog.description")}</DialogDescription>
            </DialogHeader>
            <VideoFramePicker
              src={url}
              crossOrigin
              busy={saveThumb.isPending}
              actionLabel={t("videos.saveThumbnail")}
              onCapture={(blob) => saveThumb.mutate(blob)}
            />
          </DialogContent>
        </Dialog>
      ) : null}
      {isGm ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive hover:text-destructive"
              aria-label={t("videos.removeAria", { title: video.title })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("videos.removeConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {video.video_type === "intro"
                  ? t("videos.removeConfirmBodyIntro")
                  : t("videos.removeConfirmBodyOther", { title: video.title })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRemove(video)}>
                {tc("actions.remove")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

export function CampaignVideosPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("media");
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [videoType, setVideoType] = useState<CampaignVideoType>("intro");
  const videos = useQuery({
    queryKey: ["campaign-videos", campaignId],
    queryFn: () => listCampaignVideos(campaignId),
  });
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null);
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [visibleToPlayers, setVisibleToPlayers] = useState(true);
  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadCampaignVideo(campaignId, file, { title, videoType, thumb, visibleToPlayers }),
    onSuccess: async () => {
      setTitle("");
      setPending((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return null;
      });
      setThumb(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign-videos", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-intro", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-intro-view", campaignId] }),
      ]);
      toast.success(t("videos.upload.success"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: removeCampaignVideo,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign-videos", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-intro", campaignId] }),
      ]);
      toast.success(t("videos.removeSuccess"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      {isGm ? (
        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">{t("videos.upload.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("videos.upload.description")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-video-title">{t("videos.upload.titleLabel")}</Label>
              <Input
                id="campaign-video-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("videos.upload.titlePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-video-visibility">{t("videos.visibility.label")}</Label>
              <div className="flex h-9 items-center">
                <Switch
                  id="campaign-video-visibility"
                  checked={visibleToPlayers}
                  onCheckedChange={setVisibleToPlayers}
                  aria-label={t("videos.visibility.label")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-video-type">{t("videos.upload.typeLabel")}</Label>
              <Select
                value={videoType}
                onValueChange={(value) => setVideoType(value as CampaignVideoType)}
              >
                <SelectTrigger id="campaign-video-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_VIDEO_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {campaignVideoTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {pending ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">{t("videos.upload.pickFrameHint")}</p>
              <VideoFramePicker
                src={pending.url}
                actionLabel={
                  thumb ? t("videos.upload.frameSelected") : t("videos.upload.useThisFrame")
                }
                onCapture={(blob) => {
                  setThumb(blob);
                  toast.success(t("videos.upload.frameSelectedToast"));
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={upload.isPending}
                  onClick={() => {
                    if (!title.trim()) {
                      toast.error(t("videos.upload.enterTitleFirst"));
                      return;
                    }
                    upload.mutate(pending.file);
                  }}
                >
                  {upload.isPending
                    ? t("videos.upload.uploading")
                    : t("videos.upload.uploadButton")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={upload.isPending}
                  onClick={() => {
                    URL.revokeObjectURL(pending.url);
                    setPending(null);
                    setThumb(null);
                  }}
                >
                  {t("videos.upload.chooseAnother")}
                </Button>
                <span className="text-xs text-muted-foreground">{pending.file.name}</span>
              </div>
            </div>
          ) : (
            <FileDropzone
              className="mt-4"
              accept="video/mp4,.mp4"
              label={t("videos.upload.dropLabel")}
              hint={
                videoType === "intro"
                  ? t("videos.upload.dropHintIntro")
                  : t("videos.upload.dropHintOther")
              }
              onFiles={(files) => {
                const file = files[0];
                if (!file) return;
                setThumb(null);
                setPending({ file, url: URL.createObjectURL(file) });
              }}
            />
          )}
        </section>
      ) : null}
      {videos.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((item) => (
            <div key={item} className="panel flex items-center gap-4 p-3">
              <Skeleton className="aspect-video w-28 shrink-0 rounded-md sm:w-40" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-44 max-w-full" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="size-9 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      ) : videos.data?.length ? (
        <div className="space-y-3">
          {videos.data.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              isGm={isGm}
              onRemove={(item) => remove.mutate(item)}
            />
          ))}
        </div>
      ) : (
        <div className="panel grid min-h-64 place-items-center p-8 text-center">
          <div>
            <Film className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{t("videos.empty")}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function CampaignIntroExperience({
  campaignId,
}: {
  campaignId: string;
  isGm?: boolean;
  display?: "all" | "gate" | "panel";
}) {
  const { t } = useT("media");
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [ended, setEnded] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(true);
  const [continuedVersion, setContinuedVersion] = useState<string | null>(null);
  const gateVideoRef = useRef<HTMLVideoElement>(null);
  const introQuery = useQuery({
    queryKey: ["campaign-intro", campaignId],
    queryFn: () => getCampaignIntro(campaignId),
  });
  const viewQuery = useQuery({
    queryKey: ["campaign-intro-view", campaignId],
    queryFn: () => getMyCampaignIntroView(campaignId),
  });
  const intro = introQuery.data;
  useEffect(() => {
    let live = true;
    setVideoUrl(null);
    setPosterUrl(null);
    setVideoReady(false);
    setEnded(false);
    setDoNotShowAgain(true);
    if (intro?.storage_path) {
      void campaignIntroUrl(intro.storage_path).then((url) => {
        if (live) setVideoUrl(url);
      });
    }
    if (intro?.thumb_path) {
      void campaignVideoThumbUrl(intro.thumb_path).then((url) => {
        if (live) setPosterUrl(url || null);
      });
    }
    return () => {
      live = false;
    };
  }, [intro?.storage_path, intro?.thumb_path, intro?.version]);
  const remember = useMutation({
    mutationFn: () =>
      intro ? saveCampaignIntroView(campaignId, intro.version) : Promise.resolve(),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["campaign-intro-view", campaignId] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const loading = introQuery.isLoading || viewQuery.isLoading;
  const blocked =
    !loading &&
    intro &&
    continuedVersion !== intro.version &&
    shouldBlockForCampaignIntro(intro, viewQuery.data);
  if (!loading && !blocked) return null;
  if (!hydrated) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={t("introExperience.ariaLabel")}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8">
        <div className="relative flex aspect-video max-h-full w-full max-w-6xl items-center justify-center overflow-hidden rounded-md border border-border bg-card shadow-2xl">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-50"
            />
          ) : null}
          {!videoReady ? (
            <div className="relative z-10 flex flex-col items-center gap-3 text-muted-foreground">
              <span className="grid size-12 place-items-center rounded-full border border-border bg-background/80">
                <LoaderCircle className="h-6 w-6 animate-spin" />
              </span>
              <span className="text-sm font-medium">{t("introExperience.preparing")}</span>
            </div>
          ) : null}
          {blocked && videoUrl ? (
            <video
              ref={gateVideoRef}
              key={intro.version}
              src={videoUrl}
              poster={posterUrl ?? undefined}
              autoPlay
              controls
              playsInline
              preload="auto"
              onCanPlay={() => setVideoReady(true)}
              onPlay={() => {
                const video = gateVideoRef.current;
                if (video && document.fullscreenElement == null)
                  video.requestFullscreen?.().catch(() => undefined);
              }}
              onEnded={() => {
                setEnded(true);
                if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
              }}
              className={`absolute inset-0 size-full bg-background object-contain transition-opacity duration-300 ${videoReady ? "opacity-100" : "opacity-0"}`}
              aria-label={t("introExperience.ariaLabel")}
            />
          ) : null}
        </div>
      </div>
      {blocked ? (
        <div className="shrink-0 border-t border-border bg-card p-4 sm:p-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                id="skip-campaign-intro"
                checked={doNotShowAgain}
                onCheckedChange={(value) => setDoNotShowAgain(value === true)}
                disabled={!ended}
              />
              <Label
                htmlFor="skip-campaign-intro"
                className={!ended ? "text-muted-foreground" : undefined}
              >
                {t("introExperience.dontShowAgain")}
              </Label>
            </div>
            <Button
              type="button"
              disabled={!ended || remember.isPending}
              onClick={async () => {
                if (!intro || !ended) return;
                if (doNotShowAgain) await remember.mutateAsync();
                setContinuedVersion(intro.version);
              }}
            >
              {ended ? t("introExperience.continueButton") : t("introExperience.watchFullButton")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
