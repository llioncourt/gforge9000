import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { campaignIntroUrl, getCampaignIntro, getMyCampaignIntroView, removeCampaignIntro, saveCampaignIntroView, shouldBlockForCampaignIntro, uploadCampaignIntro } from "@/lib/campaign-intro";

export function CampaignIntroExperience({ campaignId, isGm, display = "all" }: { campaignId: string; isGm: boolean; display?: "all" | "gate" | "panel" }) {
  const queryClient = useQueryClient();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [continuedVersion, setContinuedVersion] = useState<string | null>(null);
  const gateVideoRef = useRef<HTMLVideoElement>(null);
  const introQuery = useQuery({ queryKey: ["campaign-intro", campaignId], queryFn: () => getCampaignIntro(campaignId) });
  const viewQuery = useQuery({ queryKey: ["campaign-intro-view", campaignId], queryFn: () => getMyCampaignIntroView(campaignId) });
  const intro = introQuery.data;

  useEffect(() => {
    let live = true;
    setVideoUrl(null);
    setEnded(false);
    setDoNotShowAgain(false);
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
      {loading ? <Skeleton className="aspect-video w-full rounded-lg" /> : intro && videoUrl ? <section className="panel overflow-hidden"><video src={videoUrl} controls preload="metadata" className="aspect-video w-full bg-background object-contain" aria-label="Campaign intro video"/><div className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{intro.file_name}</p><p className="text-xs text-muted-foreground">{Math.ceil(intro.byte_size / 1024 / 1024)} MB</p></div>{isGm ? <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Remove campaign intro"><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove the campaign intro?</AlertDialogTitle><AlertDialogDescription>Members will no longer see this video when entering the campaign.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove.mutate()}>Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</div></section> : <div className="panel grid min-h-64 place-items-center p-8 text-center"><div><Film className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-3 text-sm text-muted-foreground">No campaign intro has been uploaded yet.</p></div></div>}
    </div> : null}
    {display !== "panel" && (loading || blocked) ? <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="Campaign introduction"><div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-8">{blocked && videoUrl ? <video ref={gateVideoRef} key={intro.version} src={videoUrl} autoPlay controls playsInline preload="auto" onPlay={enterFullscreen} onEnded={() => { setEnded(true); exitFullscreen(); }} className="max-h-full w-full max-w-6xl bg-background object-contain" aria-label="Campaign introduction"/> : <div className="flex items-center gap-3 text-sm text-muted-foreground"><Film className="h-5 w-5"/>Loading campaign intro…</div>}</div>{blocked ? <div className="shrink-0 border-t border-border bg-card p-4 sm:p-6"><div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><Checkbox id="skip-campaign-intro" checked={doNotShowAgain} onCheckedChange={(value) => setDoNotShowAgain(value === true)} disabled={!ended}/><Label htmlFor="skip-campaign-intro" className={!ended ? "text-muted-foreground" : undefined}>Don't show this intro again</Label></div><Button type="button" disabled={!ended || remember.isPending} onClick={() => void continueToCampaign()}>{ended ? "Continue to campaign" : "Watch the full intro to continue"}</Button></div></div> : null}</div> : null}
  </>;
}
