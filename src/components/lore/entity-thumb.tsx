import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { entityImageUrl } from "@/lib/entity-image";
import { portraitInitials } from "@/lib/portrait";
import { ImageZoom } from "@/components/ui/image-zoom";
import { Badge } from "@/components/ui/badge";

/** Small square preview of a lore entry's photo, used on cards. */
export function EntityThumb({
  path,
  fallbackPath,
  name,
  className = "",
}: {
  path: string | null | undefined;
  /** Used when the main image is missing or fails to load (e.g. linked sheet portrait). */
  fallbackPath?: string | null;
  name: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [path]);
  const effective = broken ? (fallbackPath ?? null) : (path ?? fallbackPath ?? null);
  const url = useQuery({
    queryKey: ["entity-photo", effective],
    queryFn: () => entityImageUrl(effective),
    enabled: !!effective,
    staleTime: 1000 * 60 * 30,
  });

  const base = `bg-muted text-muted-foreground size-12 shrink-0 overflow-hidden rounded-md border ${className}`;
  // True when the displayed image is the linked character sheet portrait
  // (no own image, or own image broken, falling back to the sheet portrait).
  const fromChar = !!fallbackPath && (!path || broken);

  if (effective && url.data) {
    return (
      <div className="relative">
        <ImageZoom
          src={url.data}
          alt={`${name} photo`}
          onError={() => setBroken(true)}
          className={base}
        />
        {fromChar ? (
          <Badge
            variant="secondary"
            className="pointer-events-none absolute top-0.5 left-0.5 px-1 py-0 text-[9px] leading-none shadow"
          >
            From Char
          </Badge>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`${base} flex items-center justify-center text-xs font-semibold`}>
      {portraitInitials(name)}
    </div>
  );
}
