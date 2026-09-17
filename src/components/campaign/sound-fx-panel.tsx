import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioWaveform, Download, GripVertical, Play, Trash2, Upload } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { ImportDialog, useTransferTask } from "@/components/ui/transfer-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  deleteCampaignSoundFx,
  listCampaignSoundFx,
  reorderCampaignSoundFx,
  triggerCampaignSoundFx,
  uploadCampaignSoundFx,
  type CampaignSoundFx,
} from "@/lib/campaign-sound-fx";
import { buildSoundFxPackZip, readSoundFxPack } from "@/lib/sound-fx-pack";
import { useT } from "@/i18n/hooks";

export function SoundFxPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("media");
  const { t: tc } = useT("common");
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const effects = useQuery({
    queryKey: ["campaign-sound-fx", campaignId],
    queryFn: () => listCampaignSoundFx(campaignId),
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadCampaignSoundFx(campaignId, title, file),
    onSuccess: async () => {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["campaign-sound-fx", campaignId] });
      toast.success(t("soundFx.upload.success"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: deleteCampaignSoundFx,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaign-sound-fx", campaignId] });
      toast.success(t("soundFx.removeSuccess"));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const trigger = useMutation({
    mutationFn: (effect: CampaignSoundFx) => triggerCampaignSoundFx(campaignId, effect.id),
    onError: (error: Error) => toast.error(error.message),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const toggleSelected = (id: string, checked: boolean) =>
    setSelected((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id),
    );
  const removeSelected = useMutation({
    mutationFn: async () => {
      const items = (effects.data ?? []).filter((effect) => selected.includes(effect.id));
      for (const item of items) await deleteCampaignSoundFx(item);
      return items.length;
    },
    onSuccess: async (count) => {
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["campaign-sound-fx", campaignId] });
      toast.success(t("soundFx.removedSummary", { count }));
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const [importOpen, setImportOpen] = useState(false);
  const exportTask = useTransferTask();
  const importPackFile = async (file: File, report: (label: string, percent?: number) => void) => {
    report(t("soundFx.readingZip"), 8);
    const items = await readSoundFxPack(file);
    let done = 0;
    for (const item of items) {
      await uploadCampaignSoundFx(campaignId, item.title, item.file);
      done += 1;
      report(
        t("soundFx.uploadingEffects", { done, total: items.length }),
        10 + Math.round((done / Math.max(1, items.length)) * 85),
      );
    }
    await queryClient.invalidateQueries({ queryKey: ["campaign-sound-fx", campaignId] });
    return t("soundFx.importedSummary", { count: items.length });
  };
  const downloadPack = () =>
    void exportTask.run(t("soundFx.downloadPack"), async (report) => {
      report(t("soundFx.generatingPackage"), 45);
      const url = URL.createObjectURL(buildSoundFxPackZip());
      const link = document.createElement("a");
      link.href = url;
      link.download = "sound-fx-modelo.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      report(t("soundFx.downloading"), 90);
      return t("soundFx.templateDownloaded");
    });

  // --- Drag-and-drop reordering (GM only) ---
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const orderedEffects = useMemo(() => effects.data ?? [], [effects.data]);
  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderCampaignSoundFx(campaignId, ids),
    onError: async (error: Error) => {
      await queryClient.invalidateQueries({ queryKey: ["campaign-sound-fx", campaignId] });
      toast.error(error.message);
    },
  });
  const commitReorder = (next: CampaignSoundFx[]) => {
    queryClient.setQueryData(
      ["campaign-sound-fx", campaignId],
      next.map((item, index) => ({ ...item, sort_order: index })),
    );
    reorder.mutate(next.map((item) => item.id));
  };

  return (
    <div className="space-y-6">
      {isGm ? (
        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">{t("soundFx.upload.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("soundFx.upload.description")}
          </p>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="sound-fx-title">{t("soundFx.upload.titleLabel")}</Label>
            <Input
              id="sound-fx-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("soundFx.upload.titlePlaceholder")}
            />
          </div>
          <FileDropzone
            className="mt-4"
            accept="audio/mpeg,audio/ogg,audio/opus,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/webm,.mp3,.ogg,.opus,.m4a,.wav,.webm"
            loading={upload.isPending}
            loadingLabel={t("soundFx.upload.uploading")}
            label={t("soundFx.upload.dropLabel")}
            hint={t("soundFx.upload.dropHint")}
            onFiles={(files) => {
              const file = files[0];
              if (!file) return;
              if (!title.trim()) {
                toast.error(t("soundFx.upload.enterTitleFirst"));
                return;
              }
              upload.mutate(file);
            }}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadPack}>
              <Download className="mr-1 h-4 w-4" /> {t("soundFx.downloadPack")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1 h-4 w-4" /> {t("soundFx.importZip")}
            </Button>
            <ImportDialog
              open={importOpen}
              onOpenChange={setImportOpen}
              title={t("soundFx.importDialog.title")}
              description={t("soundFx.importDialog.description")}
              accept=".zip,application/zip"
              label={t("soundFx.importDialog.label")}
              hint={t("soundFx.importDialog.hint")}
              run={importPackFile}
            />
            {exportTask.node}
          </div>
        </section>
      ) : null}
      {isGm && selected.length ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <p className="text-sm text-muted-foreground">{t("soundFx.selectedCount", { count: selected.length })}</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
              {t("soundFx.clearSelection")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={removeSelected.isPending}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> {t("soundFx.removeSelected")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("soundFx.removeSelectedConfirmTitle", { count: selected.length })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("soundFx.removeSelectedConfirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeSelected.mutate()}>
                    {tc("actions.remove")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ) : null}
      {effects.isLoading ? (
        <div className="panel divide-y divide-border">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3 p-3">
              <Skeleton className="size-9 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="size-9 rounded-md" />
            </div>
          ))}
        </div>
      ) : orderedEffects.length ? (
        <div className="panel divide-y divide-border">
          {orderedEffects.map((effect, index) => {
            const isDragging = dragIndex === index;
            const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
            return (
              <div
                key={effect.id}
                data-search-id={effect.id}
                draggable={isGm}
                onDragStart={(e) => {
                  if (!isGm) return;
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnter={() => {
                  if (dragIndex !== null) setOverIndex(index);
                }}
                onDragOver={(e) => {
                  if (!isGm) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDrop={(e) => {
                  if (!isGm || dragIndex === null) return;
                  e.preventDefault();
                  const from = dragIndex;
                  const to = index;
                  if (from === to) {
                    setDragIndex(null);
                    setOverIndex(null);
                    return;
                  }
                  const next = [...orderedEffects];
                  const moved = next.splice(from, 1)[0];
                  if (!moved) {
                    setDragIndex(null);
                    setOverIndex(null);
                    return;
                  }
                  next.splice(to, 0, moved);
                  setDragIndex(null);
                  setOverIndex(null);
                  commitReorder(next);
                }}
                className={`flex items-center gap-3 p-3 transition-colors ${isDragging ? "opacity-40" : ""} ${isOver ? "bg-accent/60" : ""}`}
              >
                {isGm ? (
                  <span className="cursor-grab text-muted-foreground" aria-label={t("soundFx.dragAria")}>
                    <GripVertical className="h-4 w-4" />
                  </span>
                ) : null}
                {isGm ? (
                  <Checkbox
                    checked={selected.includes(effect.id)}
                    onCheckedChange={(checked) => toggleSelected(effect.id, checked === true)}
                    aria-label={t("soundFx.selectAria", { title: effect.title })}
                  />
                ) : null}
                <Button
                  type="button"
                  size="icon"
                  disabled={!isGm || trigger.isPending}
                  onClick={() => trigger.mutate(effect)}
                  aria-label={t("soundFx.playAria", { title: effect.title })}
                >
                  <Play className="h-4 w-4 fill-current" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{effect.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("soundFx.fileSize", { name: effect.file_name, size: Math.max(1, Math.ceil(effect.byte_size / 1024)) })}
                  </p>
                </div>
                {isGm ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label={t("soundFx.removeAria", { title: effect.title })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("soundFx.removeConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("soundFx.removeConfirmBody", { title: effect.title })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove.mutate(effect)}>
                          {tc("actions.remove")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel grid min-h-64 place-items-center p-8 text-center">
          <div>
            <AudioWaveform className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{t("soundFx.empty")}</p>
          </div>
        </div>
      )}
      {!isGm && orderedEffects.length ? (
        <p className="text-xs text-muted-foreground">{t("soundFx.gmControlled")}</p>
      ) : null}
    </div>
  );
}
