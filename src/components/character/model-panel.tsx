import { Suspense, lazy, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Box, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

export function ModelPanel({
  characterId,
  path,
  onChange,
}: {
  characterId: string;
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const signed = useModelUrl(path);
  const [mounted, setMounted] = useState(false);
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
      <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border bg-muted/30">
        {signed && mounted ? (
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ModelViewer url={signed} />
          </Suspense>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Box className="h-8 w-8 opacity-50" aria-hidden="true" />
            <span className="text-xs">No 3D model</span>
          </div>
        )}
      </div>
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
              <Box className="h-3.5 w-3.5" /> Private to your account
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
    </div>
  );
}
