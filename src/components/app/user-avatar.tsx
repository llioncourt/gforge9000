import { useQuery } from "@tanstack/react-query";
import { portraitInitials, portraitUrl } from "@/lib/portrait";
import { cn } from "@/lib/utils";

/**
 * Circular token for a user: profile photo when available, initials otherwise.
 * avatarPath points into the portraits bucket (signed URL resolved here).
 */
export function UserAvatar({
  name,
  avatarPath,
  className,
}: {
  name: string;
  avatarPath?: string | null | undefined;
  className?: string;
}) {
  const { data: url } = useQuery({
    queryKey: ["portrait", avatarPath ?? "none"],
    queryFn: () => portraitUrl(avatarPath),
    enabled: !!avatarPath,
    staleTime: 1000 * 60 * 30,
  });

  return (
    <span
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted/40",
        className,
      )}
      title={name}
    >
      {url ? (
        <img
          loading="lazy"
          decoding="async"
          src={url}
          alt={name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[10px] font-semibold text-muted-foreground">
          {portraitInitials(name)}
        </span>
      )}
    </span>
  );
}
