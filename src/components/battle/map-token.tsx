import { Suspense, lazy, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import type { Tables } from "@/integrations/supabase/types";
import { portraitUrl } from "@/lib/portrait";
import { modelUrl, parseModelTransform } from "@/lib/model3d";
import type { MapObjectRow } from "@/lib/battlemap";
import { cn } from "@/lib/utils";

const ModelViewer = lazy(() => import("@/components/character/model-viewer"));

type CharacterRow = Tables<"characters">;

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Token visual, in order of preference:
 * PC: 3D model → portrait → name token. NPC/marker: stored image → name token.
 */
export function MapToken({
  object,
  character,
  fallbackImagePath,
  sizePx,
  selected,
  dimmed,
  use3d,
}: {
  object: MapObjectRow;
  character: CharacterRow | null;
  fallbackImagePath?: string | null;
  sizePx: number;
  selected: boolean;
  dimmed: boolean;
  use3d: boolean;
}) {
  const label = object.label || character?.name || "Token";

  const portrait = useQuery({
    queryKey: ["portrait-url", character?.portrait_path],
    queryFn: () => portraitUrl(character?.portrait_path),
    enabled: Boolean(character?.portrait_path),
    staleTime: 1000 * 60 * 30,
  });

  const npcImage = useQuery({
    queryKey: ["entity-photo", fallbackImagePath ?? object.image_url],
    queryFn: () => portraitUrl(fallbackImagePath ?? object.image_url),
    enabled: !character && Boolean(fallbackImagePath ?? object.image_url),
    staleTime: 1000 * 60 * 30,
  });

  const model = useQuery({
    queryKey: ["model-url", character?.model_path],
    queryFn: () => modelUrl(character?.model_path),
    enabled: use3d && Boolean(character?.model_path),
    staleTime: 1000 * 60 * 30,
  });

  const transform = useMemo(
    () => parseModelTransform(character?.model_transform),
    [character?.model_transform],
  );

  const ring = selected ? "ring-primary ring-2" : "ring-border ring-1";

  return (
    <div
      className={cn(
        "bg-card/90 relative flex items-center justify-center overflow-hidden rounded-full shadow-md",
        ring,
        dimmed && "opacity-50",
      )}
      style={{ width: sizePx, height: sizePx, borderColor: object.color ?? undefined }}
      title={label}
    >
      {use3d && model.data ? (
        <ClientOnly fallback={<span className="text-xs font-semibold">{initials(label)}</span>}>
          <Suspense fallback={<span className="text-xs font-semibold">{initials(label)}</span>}>
            <ModelViewer
              url={model.data}
              transform={transform}
              settings={{ ...DEFAULT_VIEWER_SETTINGS, autoRotate: false }}
            />
          </Suspense>
        </ClientOnly>
      ) : portrait.data || npcImage.data ? (
        <img decoding="async"
          src={portrait.data ?? npcImage.data ?? undefined}
          alt={label}
          className="h-full w-full object-cover object-top"
          draggable={false}
        />
      ) : (
        <span
          className="px-1 text-center leading-none font-semibold"
          style={{ fontSize: Math.max(10, sizePx / 3), color: object.color ?? undefined }}
        >
          {initials(label)}
        </span>
      )}
      {object.hidden ? (
        <span className="bg-background/80 absolute right-0 bottom-0 rounded-tl px-1 text-[9px]">
          hidden
        </span>
      ) : null}
    </div>
  );
}
