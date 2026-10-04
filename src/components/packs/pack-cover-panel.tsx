import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CardPortraitBg } from "@/components/character/card-portrait-bg";
import { packCoverMessage } from "@/components/packs/pack-cover-messages";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { useT } from "@/i18n/hooks";
import type { PackRow } from "@/lib/api";
import { PACK_COVER_ACCEPT, clearPackCover, savePackCover } from "@/lib/pack-cover";

/**
 * Drop area for a pack's cover, shown to the pack's owner on the pack page.
 * The cover is what sits behind the pack's card in the pack list.
 */
export function PackCoverPanel({
  pack,
  packName,
  className,
}: {
  /** The pack's stored row; absent while the pack exists only on entries. */
  pack: PackRow | null | undefined;
  packName: string;
  className?: string;
}) {
  const { t } = useT("packs");
  const queryClient = useQueryClient();
  const coverPath = pack?.cover_path ?? null;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["content-packs"] }),
      queryClient.invalidateQueries({ queryKey: ["packs"] }),
    ]);

  const upload = useMutation({
    mutationFn: (file: File) => savePackCover({ pack, packName, file }),
    onSuccess: async () => {
      await refresh();
      toast.success(t("cover.updated"));
    },
    onError: (error: unknown) => toast.error(packCoverMessage(error, t)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (pack) await clearPackCover(pack);
    },
    onSuccess: async () => {
      await refresh();
      toast.success(t("cover.removed"));
    },
    onError: (error: unknown) => toast.error(packCoverMessage(error, t)),
  });

  return (
    <div className={className} data-pack-cover-panel="">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("cover.label")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("cover.hint")}</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {coverPath ? (
          <div
            className="relative flex h-28 shrink-0 flex-col justify-end overflow-hidden rounded-lg border border-border bg-card p-3 sm:w-56"
            data-pack-cover-preview=""
          >
            <CardPortraitBg path={coverPath} />
            <p className="relative truncate text-sm font-medium">{packName}</p>
          </div>
        ) : null}
        <FileDropzone
          compact
          accept={PACK_COVER_ACCEPT}
          loading={upload.isPending}
          loadingLabel={t("cover.uploading")}
          className="min-h-28 flex-1"
          label={coverPath ? t("cover.dropReplace") : t("cover.dropNew")}
          hint={t("cover.sizeHint")}
          onFiles={(files) => {
            const file = files[0];
            if (file) upload.mutate(file);
          }}
        />
        {coverPath ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 self-end sm:h-auto sm:w-10 sm:self-stretch"
            aria-label={t("cover.removeAria")}
            title={t("cover.removeAria")}
            disabled={upload.isPending || remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
