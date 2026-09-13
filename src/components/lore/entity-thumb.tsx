import { useQuery } from "@tanstack/react-query";

import { portraitInitials, portraitUrl } from "@/lib/portrait";

/** Small square preview of a lore entry's photo, used on cards. */
export function EntityThumb({
  path,
  name,
  className = "",
}: {
  path: string | null | undefined;
  name: string;
  className?: string;
}) {
  const url = useQuery({
    queryKey: ["entity-photo", path],
    queryFn: () => portraitUrl(path),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });

  const base = `bg-muted text-muted-foreground size-12 shrink-0 overflow-hidden rounded-md border ${className}`;

  if (path && url.data) {
    return <img src={url.data} alt={`${name} photo`} loading="lazy" className={`${base} object-cover`} />;
  }
  return (
    <div className={`${base} flex items-center justify-center text-xs font-semibold`}>
      {portraitInitials(name)}
    </div>
  );
}
