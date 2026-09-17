import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Pause,
  Play,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { strToU8, unzipSync, zipSync } from "fflate";
import { toast } from "sonner";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { ImportDialog, useTransferTask } from "@/components/ui/transfer-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useCampaignSoundtrack } from "@/components/campaign/campaign-soundtrack-player";
import {
  campaignSoundtrackManifestSchema,
  formatSoundtrackTime,
  MAX_SOUNDTRACK_COVER_BYTES,
  MAX_SOUNDTRACK_TRACK_BYTES,
  soundtrackAudioMime,
} from "@/lib/campaign-soundtrack-pack";
import {
  deleteCampaignSoundtrack,
  importCampaignSoundtrack,
  soundtrackSignedUrl,
  type SoundtrackAlbum,
} from "@/lib/campaign-soundtrack";
import { convertToAvif, isImageFile } from "@/lib/image-avif";
import {
  buildSoundtrackPackPrompt,
  buildSoundtrackPackReadme,
  SOUNDTRACK_EXAMPLE_MANIFEST,
} from "@/lib/soundtrack-pack-docs";
import { useT } from "@/i18n/hooks";
/** Minimal translate signature shared by the helpers in this file. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

async function coverToAvifBytes(path: string, bytes: Uint8Array, t: Translate) {
  if (/\.avif$/i.test(path)) return bytes;
  const name = path.split("/").pop() ?? "cover.png";
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);
  if (!isImageFile(file)) throw new Error(t("soundtrack.errors.coverMustBeImage", { path }));
  const converted = await convertToAvif(file);
  return new Uint8Array(await converted.arrayBuffer());
}
async function copySoundtrackPrompt(t: Translate) {
  try {
    await navigator.clipboard.writeText(buildSoundtrackPackPrompt());
    toast.success(t("soundtrack.import.promptCopied"));
  } catch {
    toast.error(t("soundtrack.import.promptCopyFailed"));
  }
}
function downloadSoundtrackReadme() {
  const zip = zipSync({
      "README.md": strToU8(buildSoundtrackPackReadme()),
      "album.example.json": strToU8(SOUNDTRACK_EXAMPLE_MANIFEST),
    }),
    blob = new Blob([zip as BlobPart], { type: "application/zip" }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "soundtrack-package-readme.zip";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function AlbumCover({ album }: { album: SoundtrackAlbum }) {
  const { t } = useT("media");
  const [url, setUrl] = useState<string | null>(null),
    [zoom, setZoom] = useState(1);
  useEffect(() => {
    let live = true;
    void soundtrackSignedUrl(album.cover_path).then((v) => {
      if (live) setUrl(v);
    });
    return () => {
      live = false;
    };
  }, [album.cover_path]);
  if (!url)
    return <div className="aspect-square w-full shrink-0 bg-muted md:h-[180px] md:w-[180px]" />;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) setZoom(1);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="group aspect-square h-auto w-full shrink-0 cursor-zoom-in overflow-hidden rounded-none p-0 md:h-[180px] md:w-[180px]"
          aria-label={t("soundtrack.cover.enlargeAria", { title: album.title })}
        >
          <img
            decoding="async"
            src={url}
            alt={t("soundtrack.cover.altText", { title: album.title })}
            className="block h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden border-0 bg-background/95 p-0 sm:rounded-none">
        <DialogTitle className="sr-only">{t("soundtrack.cover.altText", { title: album.title })}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("soundtrack.cover.enlargedAlt", { title: album.title })}
        </DialogDescription>
        <div
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6"
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            setZoom((current) =>
              Math.min(5, Math.max(1, current + (event.deltaY < 0 ? 0.2 : -0.2))),
            );
          }}
        >
          <img
            decoding="async"
            src={url}
            alt={t("soundtrack.cover.enlargedAlt", { title: album.title })}
            draggable={false}
            className="max-h-[78vh] max-w-[90vw] shrink-0 object-contain transition-transform duration-150"
            style={{ transform: `scale(${zoom})` }}
          />
        </div>
        <div className="flex shrink-0 justify-center p-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-background/90 px-4 py-2 shadow-lg">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              disabled={zoom <= 1}
              onClick={() => setZoom((current) => Math.max(1, +(current - 0.25).toFixed(2)))}
              aria-label={t("soundtrack.cover.zoomOut")}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Slider
              value={[zoom]}
              min={1}
              max={5}
              step={0.05}
              onValueChange={(value) => setZoom(value[0] ?? 1)}
              className="w-48"
              aria-label={t("soundtrack.cover.zoomSlider")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              disabled={zoom >= 5}
              onClick={() => setZoom((current) => Math.min(5, +(current + 0.25).toFixed(2)))}
              aria-label={t("soundtrack.cover.zoomIn")}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function SoundtrackPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("media");
  const { t: tc } = useT("common");
  const player = useCampaignSoundtrack(),
    qc = useQueryClient(),
    [albumIndex, setAlbumIndex] = useState(0);
  const focusItem = (useSearch({ strict: false }) as { item?: string }).item;
  useEffect(() => {
    if (!focusItem) return;
    const byAlbum = player.albums.findIndex((a) => a.id === focusItem);
    if (byAlbum >= 0) {
      setAlbumIndex(byAlbum);
      return;
    }
    const byTrack = player.albums.findIndex((a) =>
      player.tracks.some((t) => t.album_id === a.id && t.id === focusItem),
    );
    if (byTrack >= 0) setAlbumIndex(byTrack);
  }, [focusItem, player.albums, player.tracks]);
  useEffect(() => {
    setAlbumIndex((current) => Math.min(current, Math.max(0, player.albums.length - 1)));
  }, [player.albums.length]);
  const importer = useMutation({
    mutationFn: async (file: File) => {
      const archive = unzipSync(new Uint8Array(await file.arrayBuffer())),
        pick = (p: string) => archive[p] ?? archive[p.replace(/^\.\//, "")],
        raw = archive["album.json"];
      if (!raw) throw new Error(t("soundtrack.errors.missingAlbumJson"));
      const manifest = campaignSoundtrackManifestSchema.parse(
          JSON.parse(new TextDecoder().decode(raw)),
        ),
        positions = manifest.tracks.map((tr) => tr.position).sort((a, b) => a - b);
      if (positions.some((p, i) => p !== i + 1))
        throw new Error(t("soundtrack.errors.trackPositions"));
      const coverEntry = pick(manifest.album.cover);
      if (!coverEntry) throw new Error(t("soundtrack.errors.missingCover", { path: manifest.album.cover }));
      if (coverEntry.length > MAX_SOUNDTRACK_COVER_BYTES)
        throw new Error(t("soundtrack.errors.coverTooLarge"));
      const cover = await coverToAvifBytes(manifest.album.cover, coverEntry, t as Translate);
      const tracks = manifest.tracks.map((meta) => {
        const bytes = pick(meta.file);
        if (!bytes) throw new Error(t("soundtrack.errors.missingTrack", { file: meta.file }));
        const mime = soundtrackAudioMime(meta.file);
        if (!mime) throw new Error(t("soundtrack.errors.unsupportedFormat", { file: meta.file }));
        if (bytes.length > MAX_SOUNDTRACK_TRACK_BYTES)
          throw new Error(t("soundtrack.errors.trackTooLarge", { file: meta.file }));
        return {
          position: meta.position,
          name: meta.file.split("/").pop() ?? `track-${meta.position}`,
          bytes,
          mime,
        };
      });
      await importCampaignSoundtrack(
        campaignId,
        manifest,
        { name: manifest.album.cover, bytes: cover },
        tracks,
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["campaign-soundtrack", campaignId] });
    },
  });
  const exportTask = useTransferTask();
  const [importOpen, setImportOpen] = useState(false);
  const importSoundtrackFile = async (
    file: File,
    report: (label: string, percent?: number) => void,
  ) => {
    report(t("soundtrack.import.readingZip"), 10);
    report(t("soundtrack.import.uploadingAssets"), 35);
    await importer.mutateAsync(file);
    report(t("soundtrack.import.updatingSoundtrack"), 92);
    return t("soundtrack.import.imported");
  };
  const remove = useMutation({
    mutationFn: (a: SoundtrackAlbum) => deleteCampaignSoundtrack(a, player.tracks),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["campaign-soundtrack", campaignId] });
      toast.success(t("soundtrack.removeSuccess"));
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const album = player.albums[albumIndex],
    tracks = album
      ? player.tracks.filter((tr) => tr.album_id === album.id).sort((a, b) => a.position - b.position)
      : [];
  return (
    <div className="space-y-6">
      {isGm ? (
        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">{t("soundtrack.import.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("soundtrack.import.description")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copySoundtrackPrompt(t as Translate)}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {t("soundtrack.import.copyPrompt")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void exportTask.run(t("soundtrack.import.readmeTaskLabel"), async (report) => {
                  report(t("soundtrack.import.generatingPackage"), 45);
                  downloadSoundtrackReadme();
                  report(t("soundtrack.import.downloading"), 90);
                  return t("soundtrack.import.readmeDownloaded");
                })
              }
            >
              <Download className="mr-2 h-4 w-4" />
              {t("soundtrack.import.downloadReadme")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Download className="mr-2 h-4 w-4 rotate-180" />
              {t("soundtrack.import.importZip")}
            </Button>
          </div>
          <ImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            title={t("soundtrack.import.dialogTitle")}
            description={t("soundtrack.import.dialogDescription")}
            accept=".zip,application/zip"
            label={t("soundtrack.import.dropLabel")}
            run={importSoundtrackFile}
          />
          {exportTask.node}
        </section>
      ) : null}
      {!album ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          {t("soundtrack.empty")}
        </div>
      ) : (
        <section data-search-id={album.id} className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={albumIndex === 0}
              onClick={() => setAlbumIndex((current) => Math.max(0, current - 1))}
              aria-label={t("soundtrack.previousAlbum")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span
              className="text-xs font-medium tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {t("soundtrack.albumCount", { current: albumIndex + 1, total: player.albums.length })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={albumIndex === player.albums.length - 1}
              onClick={() =>
                setAlbumIndex((current) => Math.min(player.albums.length - 1, current + 1))
              }
              aria-label={t("soundtrack.nextAlbum")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div key={album.id} className="grid items-start md:grid-cols-[180px_minmax(0,1fr)]">
            <AlbumCover album={album} />
            <div className="min-w-0 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold">{album.title}</h2>
                  {album.subtitle ? (
                    <p className="mt-1 text-sm text-muted-foreground">{album.subtitle}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {album.composer ? <Badge variant="outline">{album.composer}</Badge> : null}
                    {album.release_year ? (
                      <Badge variant="outline">{album.release_year}</Badge>
                    ) : null}
                  </div>
                </div>
                {isGm ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label={t("soundtrack.removeAlbumAria", { title: album.title })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("soundtrack.removeAlbumConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("soundtrack.removeAlbumConfirmBody", { title: album.title })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(album)}>
                          {tc("actions.remove")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
              <ol className="mt-5 divide-y divide-border border-y border-border">
                {tracks.map((track) => {
                  const active = player.activeTrack?.id === track.id,
                    playing = active && player.isPlaying;
                  return (
                    <li key={track.id} data-search-id={track.id}>
                      <Button
                        variant="ghost"
                        className="h-auto w-full justify-start rounded-none px-1 py-3 text-left"
                        disabled={!isGm}
                        onClick={() => void player.playTrack(album, track)}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border">
                          {playing ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="w-7 text-xs tabular-nums text-muted-foreground">
                          {String(track.position).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{track.title}</span>
                          {track.composer ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {track.composer}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatSoundtrackTime(track.duration_seconds)}
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ol>
              {!isGm ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("soundtrack.gmControlled")}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
