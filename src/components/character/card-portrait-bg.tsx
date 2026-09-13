import { useQuery } from "@tanstack/react-query";
import { portraitUrl } from "@/lib/portrait";

/**
 * Renders a character portrait as the card background, dimmed and blurred so
 * the card content stays readable. Place inside a `relative overflow-hidden`
 * container; siblings that must sit above it need `relative`.
 */
export function CardPortraitBg({ path }: { path: string | null | undefined }) {
  const { data: url } = useQuery({
    queryKey: ["portrait", path ?? "none"],
    queryFn: () => portraitUrl(path),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });
  if (!url) return null;
  return (
    <>
      <img loading="lazy" decoding="async"
        src={url}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/95 via-background/85 to-background/70" />
    </>
  );
}
