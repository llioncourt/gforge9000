import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { campaignIntroUrl, getCampaignIntro, getMyCampaignIntroView, removeCampaignIntro, saveCampaignIntroView, shouldBlockForCampaignIntro, uploadCampaignIntro } from "@/lib/campaign-intro";

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

export function CampaignIntroExperience({ campaignId, isGm, display = "all" }: { campaignId: string; isGm: boolean; display?: "all" | "gate" | "panel" }) {
  const queryClient = useQueryClient();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [continuedVersion, setContinuedVersion] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const gateVideoRef = useRef<HTMLVideoElement>(null);
  const introQuery = useQuery({ queryKey: ["campaign-intro", campaignId], queryFn: () => getCampaignIntro(campaignId) });
  const viewQuery = useQuery({ queryKey: ["campaign-intro-view", campaignId], queryFn: () => getMyCampaignIntroView(campaignId) });
  const intro = introQuery.data;

  useEffect(() => {
    let live = true;
    setVideoUrl(null);
    setEnded(false);
    setDoNotShowAgain(false);
    setDuration(null);
    if (intro?.storage_path) void campaignIntroUrl(intro.storage_path).then((url) => { if (live) setVideoUrl(url); });
    return () => { live = false; };
  }, [intro?.storage_path, intro?.version]);

  const upload = useMutation({
    mutationFn: (file: File) => uploadCampaignIntro(campaignId, file),
    onSuccess: async () => {
      setContinuedVersion(null);
      await queryClient.invalidateQueries({ queryKey: ["campaign-intro", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-intro-view", campaignId] });
      toast.success("Campaign intro uploaded.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => intro ? removeCampaignIntro(intro) : Promise.resolve(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaign-intro", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-intro-view", campaignId] });
      toast.success("Campaign intro removed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remember = useMutation({
    mutationFn: () => intro ? saveCampaignIntroView(campaignId, intro.version) : Promise.resolve(),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["campaign-intro-view", campaignId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const loading = introQuery.isLoading || viewQuery.isLoading;
  const blocked = !loading && intro && continuedVersion !== intro.version && shouldBlockForCampaignIntro(intro, viewQuery.data);
  const continueToCampaign = async () => {
    if (!intro || !ended) return;
    if (doNotShowAgain) await remember.mutateAsync();
    setContinuedVersion(intro.version);
  };

  const enterFullscreen = () => {
    const v = gateVideoRef.current;
    if (v && document.fullscreenElement == null) {
      v.requestFullscreen?.().catch(() => {});
    }
  };
  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return <>
    {display !== "gate" ? <div className="space-y-6">
      {isGm ? <section className="panel p-5"><h2 className="font-display text-lg font-semibold">Campaign intro</h2><p className="mt-1 text-sm text-muted-foreground">Upload the MP4 shown when members first enter this campaign.</p><FileDropzone className="mt-4" accept="video/mp4,.mp4" loading={upload.isPending} loadingLabel="Uploading intro…" label={intro ? "Drop a replacement MP4 here, or click to browse" : "Drop the intro MP4 here, or click to browse"} hint="MP4 · up to 250 MB" onFiles={(files) => { const file = files[0]; if (file) upload.mutate(file); }}/></section> : null}
      {loading ? <div className="panel flex items-center gap-4 p-3"><Skeleton className="aspect-video w-32 shrink-0 rounded-md sm:w-44"/><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-44 max-w-full"/><Skeleton className="h-3 w-24"/></div><Skeleton className="size-9 shrink-0 rounded-md"/></div> : intro && videoUrl ? <section className="panel flex items-center gap-3 p-3 sm:gap-4"><div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md border border-border bg-background sm:w-44"><video src={videoUrl} muted playsInline preload="metadata" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} className="size-full object-cover" aria-label={`${intro.file_name} thumbnail`}/><div className="pointer-events-none absolute inset-0 bg-background/20"/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold sm:text-base">{intro.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{formatDuration(duration)} · {Math.ceil(intro.byte_size / 1024 / 1024)} MB</p></div><Dialog><DialogTrigger asChild><Button type="button" size="icon" aria-label={`Play ${intro.file_name}`}><Play className="h-4 w-4 fill-current"/></Button></DialogTrigger><DialogContent className="w-[calc(100vw-2rem)] max-w-5xl p-3 sm:p-5"><DialogHeader className="pr-8"><DialogTitle className="truncate">{intro.file_name}</DialogTitle><DialogDescription>{formatDuration(duration)}</DialogDescription></DialogHeader><video src={videoUrl} controls autoPlay playsInline preload="auto" className="aspect-video w-full bg-background object-contain" aria-label="Campaign intro video"/></DialogContent></Dialog>{isGm ? <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" aria-label="Remove campaign intro"><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove the campaign intro?</AlertDialogTitle><AlertDialogDescription>Members will no longer see this video when entering the campaign.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate()}>Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</section> : <div className="panel grid min-h-64 place-items-center p-8 text-center"><div><Film className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 text-sm text-muted-foreground">No campaign intro has been uploaded yet.</p></div></div>}
    </div> : null}
    {display !== "panel" && (loading || blocked) ? <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="Campaign introduction"><div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8">{blocked && videoUrl ? <video ref={gateVideoRef} key={intro.version} src={videoUrl} autoPlay controls playsInline preload="auto" onPlay={enterFullscreen} onEnded={() => { setEnded(true); exitFullscreen(); }} className="max-h-full w-full max-w-6xl bg-background object-contain" aria-label="Campaign introduction"/> : <div className="flex items-center gap-3 text-sm text-muted-foreground"><Film className="h-5 w-5"/>Loading campaign intro…</div>}</div>{blocked ? <div className="shrink-0 border-t border-border bg-card p-4 sm:p-6"><div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Checkbox id="skip-campaign-intro" checked={doNotShowAgain} onCheckedChange={(value) => setDoNotShowAgain(value === true)} disabled={!ended}/><Label htmlFor="skip-campaign-intro" className={!ended ? "text-muted-foreground" : undefined}>Don't show this intro again</Label></div><Button type="button" disabled={!ended || remember.isPending} onClick={() => void continueToCampaign()}>{ended ? "Continue to campaign" : "Watch the full intro to continue"}</Button></div></div> : null}</div> : null}
  </>;
}
