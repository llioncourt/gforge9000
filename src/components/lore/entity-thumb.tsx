import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { portraitInitials, portraitUrl } from "@/lib/portrait";

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
    queryFn: () => portraitUrl(effective),
    enabled: !!effective,
    staleTime: 1000 * 60 * 30,
  });

  const base = `bg-muted text-muted-foreground size-12 shrink-0 overflow-hidden rounded-md border ${className}`;

  if (effective && url.data) {
    return (
      <img
        src={url.data}
        alt={`${name} photo`}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`${base} object-cover`}
      />
    );
  }
  return (
    <div className={`${base} flex items-center justify-center text-xs font-semibold`}>
      {portraitInitials(name)}
    </div>
  );
}
