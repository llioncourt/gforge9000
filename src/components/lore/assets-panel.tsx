import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDropzone } from "@/components/ui/FileDropzone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AssetImage } from "@/components/lore/asset-image";
import { VisibilityBadge } from "@/components/lore/visibility-badge";
import {
  createAsset,
  deleteAsset,
  formatBytes,
  isImageAsset,
  listAssets,
  updateAsset,
  uploadAssetFile,
  validateAssetFile,
  type AssetRow,
} from "@/lib/assets";
import { useT } from "@/i18n/hooks";

export function AssetsPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("lore");
  const { t: tc } = useT("common");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<AssetRow | null>(null);

  const assets = useQuery({
    queryKey: ["campaign-assets", campaignId],
    queryFn: () => listAssets(campaignId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["campaign-assets", campaignId] });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return assets.data ?? [];
    return (assets.data ?? []).filter(
      (row) =>
        row.title.toLowerCase().includes(term) ||
        (row.caption ?? "").toLowerCase().includes(term) ||
        row.tags.some((tag) => tag.toLowerCase().includes(term)),
    );
  }, [assets.data, search]);

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const problem = validateAssetFile(file);
        if (problem) throw new Error(`${file.name}: ${problem}`);
      }
      setPending(files.map((f) => f.name));
      for (const file of files) {
        const stored = await uploadAssetFile(campaignId, file);
        await createAsset({
          campaign_id: campaignId,
          title: file.name.replace(/\.[a-z0-9]+$/i, ""),
          storage_path: stored.path,
          mime_type: stored.mimeType,
          byte_size: stored.byteSize,
        });
      }
    },
    onSuccess: async () => {
      toast.success(t("assets.toasts.added"));
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setPending([]),
  });

  const patch = useMutation({
    mutationFn: ({
      id,
      ...rest
    }: {
      id: string;
      title?: string;
      caption?: string;
      visible_to_players?: boolean;
    }) => updateAsset(id, rest),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (row: AssetRow) => deleteAsset(row),
    onSuccess: async () => {
      setConfirmDelete(null);
      toast.success(t("assets.toasts.removed"));
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2 size-4" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("assets.searchPlaceholder")}
            className="w-56 pl-8"
          />
        </div>
        <p className="text-muted-foreground ml-auto text-xs">
          {t("assets.itemCount", { count: rows.length })}
        </p>
      </div>

      {isGm ? (
        <FileDropzone
          multiple
          accept="image/*,application/pdf"
          onFiles={(files) => upload.mutate(files)}
          label={upload.isPending ? t("assets.dropzone.uploading") : t("assets.dropzone.label")}
          hint={pending.length ? pending.join(", ") : t("assets.dropzone.hint")}
        />
      ) : null}

      {assets.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-3">
              <Skeleton className="aspect-video w-full rounded-md" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {isGm ? t("assets.emptyStateGm") : t("assets.emptyStatePlayer")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <article
              key={row.id}
              data-search-id={row.id}
              className="relative space-y-3 rounded-lg border p-3"
            >
              <VisibilityBadge
                visibility={row.visible_to_players}
                isGm={isGm}
                className="absolute top-5 right-5 z-10 backdrop-blur-sm"
              />
              {isImageAsset(row) ? (
                <AssetImage
                  path={row.storage_path}
                  alt={row.title}
                  className="bg-muted aspect-video w-full rounded-md object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center rounded-md text-xs">
                  {row.mime_type}
                </div>
              )}

              {isGm ? (
                <>
                  <Input
                    defaultValue={row.title}
                    aria-label={t("assets.titleLabel")}
                    onBlur={(event) => {
                      const title = event.target.value.trim() || t("assets.defaultTitle");
                      if (title !== row.title) patch.mutate({ id: row.id, title });
                    }}
                  />
                  <Input
                    defaultValue={row.caption ?? ""}
                    aria-label={t("assets.captionLabel")}
                    placeholder={t("assets.captionPlaceholder")}
                    onBlur={(event) => {
                      const caption = event.target.value;
                      if (caption !== (row.caption ?? "")) patch.mutate({ id: row.id, caption });
                    }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`share-${row.id}`}
                        checked={row.visible_to_players}
                        onCheckedChange={(value) =>
                          patch.mutate({ id: row.id, visible_to_players: value })
                        }
                      />
                      <Label htmlFor={`share-${row.id}`} className="text-xs">
                        {t("assets.sharedWithPlayers")}
                      </Label>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("assets.removeAria", { title: row.title })}
                      onClick={() => setConfirmDelete(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div>
                  <p className="font-medium">{row.title}</p>
                  {row.caption ? (
                    <p className="text-muted-foreground text-sm">{row.caption}</p>
                  ) : null}
                </div>
              )}
              <p className="text-muted-foreground text-xs">{formatBytes(row.byte_size)}</p>
            </article>
          ))}
        </div>
      )}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("assets.deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("assets.deleteDialog.description", { title: confirmDelete?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && remove.mutate(confirmDelete)}
              disabled={remove.isPending}
            >
              {t("assets.deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
