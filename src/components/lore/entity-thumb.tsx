import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { entityImageUrl } from "@/lib/entity-image";
import { portraitInitials } from "@/lib/portrait";
import { ImageZoom } from "@/components/ui/image-zoom";
import { useT } from "@/i18n/hooks";

/** Small square preview of a lore entry's photo, used on cards. */
export function EntityThumb({
  path,
  fallbackPath,
  entityId,
  name,
  className = "",
}: {
  path: string | null | undefined;
  /** Used when the main image is missing or fails to load (e.g. linked sheet portrait). */
  fallbackPath?: string | null;
  /** Lets an older image reference be resolved without a trial request. */
  entityId?: string | undefined;
  name: string;
  className?: string;
}) {
  const { t } = useT("lore");
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [path]);
  const effective = broken ? (fallbackPath ?? null) : (path ?? fallbackPath ?? null);
  const url = useQuery({
    queryKey: ["entity-photo", effective, entityId ?? null],
    queryFn: () => entityImageUrl(effective, entityId),
    enabled: !!effective,
    staleTime: 1000 * 60 * 30,
  });

  const base = `bg-muted text-muted-foreground size-12 shrink-0 overflow-hidden rounded-md border ${className}`;

  if (effective && url.data) {
    return (
      <ImageZoom
        src={url.data}
        alt={t("entityThumb.photoAlt", { name })}
        onError={() => setBroken(true)}
        className={base}
      />
    );
  }
  return (
    <div className={`${base} flex items-center justify-center text-xs font-semibold`}>
      {portraitInitials(name)}
    </div>
  );
}
