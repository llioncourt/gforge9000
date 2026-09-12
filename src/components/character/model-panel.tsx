import { Suspense, lazy, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Box, Expand, Loader2, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { modelUrl, removeModel, uploadModel, validateModelFile } from "@/lib/model3d";

const ModelViewer = lazy(() => import("@/components/character/model-viewer"));

export function useModelUrl(path: string | null | undefined) {
  const query = useQuery({
    queryKey: ["model3d", path ?? "none"],
    queryFn: () => modelUrl(path),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });
  return path ? (query.data ?? null) : null;
}

function ViewerFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Large, interactive viewer: orbit, pan, zoom, auto-rotate and wireframe. */
export function ModelStageDialog({
  url,
  name,
  open,
  onOpenChange,
}: {
  url: string;
  name?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0">
        <DialogHeader className="px-5 pb-2 pt-4">
          <DialogTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {name ? `${name} · 3D model` : "3D model"}
          </DialogTitle>
        </DialogHeader>
        <div className="relative h-[70vh] w-full overflow-hidden rounded-b-lg border-t border-border bg-muted/20">
          {open ? (
            <Suspense fallback={<ViewerFallback />}>
              <ModelViewer url={url} stage autoRotate={autoRotate} wireframe={wireframe} />
            </Suspense>
          ) : null}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/85 px-2 py-1 backdrop-blur">
            <Button
              size="sm"
              variant={autoRotate ? "secondary" : "ghost"}
              onClick={() => setAutoRotate((v) => !v)}
            >
              <RotateCw className="mr-1 h-3.5 w-3.5" /> Rotate
            </Button>
            <Button
              size="sm"
              variant={wireframe ? "secondary" : "ghost"}
              onClick={() => setWireframe((v) => !v)}
            >
              <Box className="mr-1 h-3.5 w-3.5" /> Wireframe
            </Button>
            <span className="px-2 text-[11px] text-muted-foreground">
              Drag to orbit · scroll to zoom · right-drag to pan
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ModelPanel({
  characterId,
  name,
  path,
  readOnly = false,
  onChange,
}: {
  characterId: string;
  name?: string;
  path: string | null;
  readOnly?: boolean;
  onChange: (path: string | null) => void;
}) {
  const signed = useModelUrl(path);
  const [mounted, setMounted] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const invalid = validateModelFile(file);
      if (invalid) throw new Error(invalid);
      const next = await uploadModel(characterId, file);
      if (path) await removeModel(path).catch(() => undefined);
      return next;
    },
    onSuccess: (next) => {
      onChange(next);
      toast.success("3D model updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (path) await removeModel(path).catch(() => undefined);
    },
    onSuccess: () => {
      onChange(null);
      toast.success("3D model removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="group relative aspect-square w-full overflow-hidden rounded-md border border-border bg-muted/30">
        {signed && mounted ? (
          <>
            <Suspense fallback={<ViewerFallback />}>
              <ModelViewer url={signed} />
            </Suspense>
            <button
              type="button"
              aria-label="Open 3D model viewer"
              onClick={() => setStageOpen(true)}
              className="absolute inset-0 flex items-end justify-end p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="no-print flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground opacity-0 backdrop-blur transition group-hover:opacity-100">
                <Expand className="h-3 w-3" /> Expand
              </span>
            </button>
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Box className="h-8 w-8 opacity-50" aria-hidden="true" />
            <span className="text-xs">No 3D model</span>
          </div>
        )}
      </div>

      {signed ? (
        <ModelStageDialog url={signed} name={name} open={stageOpen} onOpenChange={setStageOpen} />
      ) : null}

      {readOnly ? null : (
        <div className="no-print space-y-2">
          <FileDropzone
            accept=".glb,model/gltf-binary"
            compact
            label="Upload 3D model"
            hint="GLB file · up to 50 MB"
            onFiles={(files) => {
              const file = files[0];
              if (file) upload.mutate(file);
            }}
          />
          <div className="flex gap-2">
            {upload.isPending ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…
              </span>
            ) : (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Box className="h-3.5 w-3.5" /> Visible to your campaign
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
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
