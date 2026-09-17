import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { useT } from "@/i18n/hooks";
import {
  portraitInitials,
  portraitUrl,
  removePortrait,
  uploadPortrait,
  validatePortraitFile,
} from "@/lib/portrait";
import { cn } from "@/lib/utils";

/** Neutral silhouette + initials placeholder. Original artwork only. */
export function PortraitFrame({
  url,
  name,
  className,
  eager = false,
}: {
  url: string | null;
  name: string;
  className?: string;
  eager?: boolean;
}) {
  const { t } = useT("characters");
  return (
    <div
      className={cn(
        "portrait-frame relative aspect-[3/4] w-full overflow-hidden rounded-md border border-border bg-muted/30",
        className,
      )}
    >
      {url ? (
        <img decoding="async"
          src={url}
          alt={t("sheet.portrait.alt", { name })}
          className="h-full w-full object-cover object-top"
          loading={eager ? "eager" : "lazy"}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true" fill="currentColor">
            <circle cx="32" cy="22" r="12" opacity="0.55" />
            <path d="M8 62c0-13.3 10.7-24 24-24s24 10.7 24 24z" opacity="0.35" />
          </svg>
          <span className="stat-value text-lg">{portraitInitials(name)}</span>
        </div>
      )}
    </div>
  );
}

export function usePortraitUrl(path: string | null | undefined) {
  const query = useQuery({
    queryKey: ["portrait", path ?? "none"],
    queryFn: () => portraitUrl(path),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });
  return path ? (query.data ?? null) : null;
}

export function PortraitPanel({
  characterId,
  name,
  path,
  onChange,
}: {
  characterId: string;
  name: string;
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const { t } = useT("characters");
  const { t: tc } = useT("common");
  const signed = usePortraitUrl(path);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const invalid = validatePortraitFile(file);
      if (invalid) throw new Error(invalid);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
      const next = await uploadPortrait(characterId, file);
      if (path) await removePortrait(path).catch(() => undefined);
      return next;
    },
    onSuccess: (next) => {
      onChange(next);
      toast.success(t("sheet.portrait.updated"));
    },
    onError: (e: Error) => {
      setPreview(null);
      toast.error(e.message);
    },
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (path) await removePortrait(path).catch(() => undefined);
    },
    onSuccess: () => {
      setPreview(null);
      onChange(null);
      toast.success(t("sheet.portrait.removed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <PortraitFrame url={preview ?? signed} name={name} />
      <div className="no-print space-y-2">
        <FileDropzone
          accept="image/*"
          compact
          label={t("sheet.portrait.uploadLabel")}
          hint={t("sheet.portrait.uploadHint")}
          onFiles={(files) => {
            const file = files[0];
            if (file) upload.mutate(file);
          }}
        />
        <div className="flex gap-2">
          {upload.isPending ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {tc("uploading")}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <ImageUp className="h-3.5 w-3.5" /> {t("sheet.portrait.privateHint")}
            </span>
          )}
          {path ? (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => clear.mutate()}
              disabled={clear.isPending}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> {tc("remove")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
