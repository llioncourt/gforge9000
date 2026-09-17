import { useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/hooks";

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
  compact?: boolean;
  className?: string;
  /** When true, shows a spinner and disables interaction. */
  loading?: boolean;
  /** Text shown while loading; defaults to "Importing…". */
  loadingLabel?: ReactNode;
}

/** Shared drag-and-drop upload surface. Every file input in the app uses this. */
export function FileDropzone({
  onFiles,
  accept,
  multiple = false,
  label,
  hint,
  compact = false,
  className,
  loading = false,
  loadingLabel,
}: FileDropzoneProps) {
  const { t } = useT("common");
  const resolvedLabel = label ?? t("dropzone.default");
  const resolvedLoadingLabel = loadingLabel ?? t("upload.importing");
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function handle(list: FileList | null) {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  }

  return (
    <div
      role="button"
      tabIndex={loading ? -1 : 0}
      onClick={() => !loading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (loading) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!loading) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!loading) handle(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-input bg-card/50 text-center text-muted-foreground transition-colors hover:border-ring hover:text-foreground",
        compact ? "px-4 py-3" : "px-6 py-10",
        over && "border-ring bg-accent/40 text-foreground",
        loading && "pointer-events-none opacity-70",
        className,
      )}
    >
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {resolvedLoadingLabel}
        </div>
      ) : (
        <>
          <div>{resolvedLabel}</div>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
