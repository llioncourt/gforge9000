import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Image as ImageIcon, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoFramePicker } from "@/components/campaign/video-frame-picker";
import { CAMPAIGN_VIDEO_TYPES, campaignVideoThumbUrl, setCampaignVideoThumb, campaignIntroUrl, campaignVideoTypeLabel, getCampaignIntro, getMyCampaignIntroView, listCampaignVideos, removeCampaignVideo, saveCampaignIntroView, shouldBlockForCampaignIntro, uploadCampaignVideo, type CampaignVideo, type CampaignVideoType } from "@/lib/campaign-intro";

function formatDuration(seconds: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "Duration unavailable";
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function VideoRow({ video, isGm, onRemove }: { video: CampaignVideo; isGm: boolean; onRemove: (video: CampaignVideo) => void }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [thumbOpen, setThumbOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void campaignIntroUrl(video.storage_path).then((value) => { if (live) setUrl(value); });
    return () => { live = false; };
  }, [video.storage_path]);
  useEffect(() => {
    let live = true;
    setThumbUrl(null);
    if (video.thumb_path) void campaignVideoThumbUrl(video.thumb_path).then((value) => { if (live) setThumbUrl(value || null); });
    return () => { live = false; };
  }, [video.thumb_path]);
  const saveThumb = useMutation({
    mutationFn: (blob: Blob) => setCampaignVideoThumb(video, blob),
    onSuccess: async () => {
      setThumbOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["campaign-videos", video.campaign_id] });
      toast.success("Thumbnail updated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return <div className="panel flex items-center gap-3 p-3 sm:gap-4">
    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md border border-border bg-background sm:w-40">
      {thumbUrl ? <img src={thumbUrl} alt={`${video.title} thumbnail`} className="size-full object-cover" /> : null}
      {url ? <video src={url} muted playsInline preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} className={thumbUrl ? "hidden" : "size-full object-cover"} aria-label={`${video.title} thumbnail`} /> : thumbUrl ? null : <Skeleton className="size-full rounded-none" />}
      <div className="pointer-events-none absolute inset-0 bg-background/20" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold sm:text-base">{video.title}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{campaignVideoTypeLabel(video.video_type)}</Badge>
        <span className="text-xs text-muted-foreground">{formatDuration(duration)} · {Math.ceil(video.byte_size / 1024 / 1024)} MB</span>
      </div>
    </div>
    {url ? <Dialog><DialogTrigger asChild><Button type="button" size="icon" aria-label={`Play ${video.title}`}><Play className="h-4 w-4 fill-current" /></Button></DialogTrigger><DialogContent className="w-[calc(100vw-2rem)] max-w-5xl p-3 sm:p-5"><DialogHeader className="pr-8"><DialogTitle className="truncate">{video.title}</DialogTitle><DialogDescription>{campaignVideoTypeLabel(video.video_type)} · {formatDuration(duration)}</DialogDescription></DialogHeader><video src={url} controls autoPlay playsInline preload="auto" className="aspect-video w-full bg-background object-contain" aria-label={`${video.title} video`} /></DialogContent></Dialog> : null}
    {isGm && url ? <Dialog open={thumbOpen} onOpenChange={setThumbOpen}><DialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Edit thumbnail of ${video.title}`}><ImageIcon className="h-4 w-4" /></Button></DialogTrigger><DialogContent className="w-[calc(100vw-2rem)] max-w-3xl"><DialogHeader><DialogTitle>Thumbnail frame</DialogTitle><DialogDescription>Scrub to the frame you want and save it as the thumbnail.</DialogDescription></DialogHeader><VideoFramePicker src={url} crossOrigin busy={saveThumb.isPending} actionLabel="Save thumbnail" onCapture={(blob) => saveThumb.mutate(blob)} /></DialogContent></Dialog> : null}
    {isGm ? <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" aria-label={`Remove ${video.title}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this video?</AlertDialogTitle><AlertDialogDescription>{video.video_type === "intro" ? "Members will no longer see this video when entering the campaign." : `${video.title} will be permanently removed.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => onRemove(video)}>Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}
  </div>;
}

export function CampaignVideosPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [videoType, setVideoType] = useState<CampaignVideoType>("intro");
  const videos = useQuery({ queryKey: ["campaign-videos", campaignId], queryFn: () => listCampaignVideos(campaignId) });
  const upload = useMutation({
    mutationFn: (file: File) => uploadCampaignVideo(campaignId, file, { title, videoType }),
    onSuccess: async () => {
      setTitle("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["campaign-videos", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-intro", campaignId] }),
        queryClient.invalidateQueries({ queryKey: ["campaign-intro-view", campaignId] }),
      ]);
      toast.success("Video uploaded.");
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
      toast.success("Video removed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return <div className="space-y-6">
    {isGm ? <section className="panel p-5"><h2 className="font-display text-lg font-semibold">Upload video</h2><p className="mt-1 text-sm text-muted-foreground">Intro videos welcome players on first entry. Other types are optional campaign media.</p><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]"><div className="space-y-1.5"><Label htmlFor="campaign-video-title">Title</Label><Input id="campaign-video-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Video title" /></div><div className="space-y-1.5"><Label htmlFor="campaign-video-type">Type</Label><Select value={videoType} onValueChange={(value) => setVideoType(value as CampaignVideoType)}><SelectTrigger id="campaign-video-type"><SelectValue /></SelectTrigger><SelectContent>{CAMPAIGN_VIDEO_TYPES.map((type) => <SelectItem key={type} value={type}>{campaignVideoTypeLabel(type)}</SelectItem>)}</SelectContent></Select></div></div><FileDropzone className="mt-4" accept="video/mp4,.mp4" loading={upload.isPending} loadingLabel="Uploading video…" label="Drop an MP4 here, or click to browse" hint={videoType === "intro" ? "MP4 · up to 250 MB · replaces the current Intro" : "MP4 · up to 250 MB"} onFiles={(files) => { const file = files[0]; if (!file) return; if (!title.trim()) { toast.error("Enter a video title first."); return; } upload.mutate(file); }} /></section> : null}
    {videos.isLoading ? <div className="space-y-3">{[0, 1].map((item) => <div key={item} className="panel flex items-center gap-4 p-3"><Skeleton className="aspect-video w-28 shrink-0 rounded-md sm:w-40" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-44 max-w-full" /><Skeleton className="h-5 w-28" /></div><Skeleton className="size-9 shrink-0 rounded-md" /></div>)}</div> : videos.data?.length ? <div className="space-y-3">{videos.data.map((video) => <VideoRow key={video.id} video={video} isGm={isGm} onRemove={(item) => remove.mutate(item)} />)}</div> : <div className="panel grid min-h-64 place-items-center p-8 text-center"><div><Film className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">No campaign videos yet.</p></div></div>}
  </div>;
}

export function CampaignIntroExperience({ campaignId }: { campaignId: string; isGm?: boolean; display?: "all" | "gate" | "panel" }) {
  const queryClient = useQueryClient();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [continuedVersion, setContinuedVersion] = useState<string | null>(null);
  const gateVideoRef = useRef<HTMLVideoElement>(null);
  const introQuery = useQuery({ queryKey: ["campaign-intro", campaignId], queryFn: () => getCampaignIntro(campaignId) });
  const viewQuery = useQuery({ queryKey: ["campaign-intro-view", campaignId], queryFn: () => getMyCampaignIntroView(campaignId) });
  const intro = introQuery.data;
  useEffect(() => { let live = true; setVideoUrl(null); setEnded(false); setDoNotShowAgain(false); if (intro?.storage_path) void campaignIntroUrl(intro.storage_path).then((url) => { if (live) setVideoUrl(url); }); return () => { live = false; }; }, [intro?.storage_path, intro?.version]);
  const remember = useMutation({ mutationFn: () => intro ? saveCampaignIntroView(campaignId, intro.version) : Promise.resolve(), onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["campaign-intro-view", campaignId] }), onError: (error: Error) => toast.error(error.message) });
  const loading = introQuery.isLoading || viewQuery.isLoading;
  const blocked = !loading && intro && continuedVersion !== intro.version && shouldBlockForCampaignIntro(intro, viewQuery.data);
  if (!loading && !blocked) return null;
  return <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="Campaign introduction"><div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8">{blocked && videoUrl ? <video ref={gateVideoRef} key={intro.version} src={videoUrl} autoPlay controls playsInline preload="auto" onPlay={() => { const video = gateVideoRef.current; if (video && document.fullscreenElement == null) video.requestFullscreen?.().catch(() => undefined); }} onEnded={() => { setEnded(true); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined); }} className="max-h-full w-full max-w-6xl bg-background object-contain" aria-label="Campaign introduction" /> : <div className="flex items-center gap-3 text-sm text-muted-foreground"><Film className="h-5 w-5" />Loading campaign intro…</div>}</div>{blocked ? <div className="shrink-0 border-t border-border bg-card p-4 sm:p-6"><div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Checkbox id="skip-campaign-intro" checked={doNotShowAgain} onCheckedChange={(value) => setDoNotShowAgain(value === true)} disabled={!ended} /><Label htmlFor="skip-campaign-intro" className={!ended ? "text-muted-foreground" : undefined}>Don&apos;t show this intro again</Label></div><Button type="button" disabled={!ended || remember.isPending} onClick={async () => { if (!intro || !ended) return; if (doNotShowAgain) await remember.mutateAsync(); setContinuedVersion(intro.version); }}>{ended ? "Continue to campaign" : "Watch the full intro to continue"}</Button></div></div> : null}</div>;
}