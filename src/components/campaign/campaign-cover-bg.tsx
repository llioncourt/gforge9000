import { useQuery } from "@tanstack/react-query";
import { campaignCoverUrl } from "@/lib/campaign-cover";
import { cn } from "@/lib/utils";

export function CampaignCoverBg({
  path,
  previewUrl,
  className,
}: {
  path: string | null | undefined;
  previewUrl?: string | null;
  className?: string;
}) {
  const cover = useQuery({
    queryKey: ["campaign-cover", path ?? "none"],
    queryFn: () => campaignCoverUrl(path),
    enabled: !!path && !previewUrl,
    staleTime: 1000 * 60 * 30,
  });
  const url = previewUrl || cover.data;
  if (!url) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/25" />
    </div>
  );
}