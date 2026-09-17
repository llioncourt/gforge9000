import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { normalizeVisibility } from "@/lib/visibility";
import { useT } from "@/i18n/hooks";

type VisibilityBadgeProps = {
  visibility: string | boolean | null | undefined;
  isGm: boolean;
  className?: string;
};

const TONES: Record<string, string> = {
  GM_ONLY: "border-destructive/50 bg-destructive/15 text-destructive",
  UNREVEALED: "border-destructive/50 bg-destructive/15 text-destructive",
  SELECTED_PLAYERS: "border-warning/50 bg-warning/15 text-warning",
  ALL_PLAYERS: "border-success/50 bg-success/15 text-success",
  PUBLIC: "border-success/50 bg-success/15 text-success",
};

export function VisibilityBadge({ visibility, isGm, className }: VisibilityBadgeProps) {
  const { t } = useT("lore");
  if (!isGm) return null;
  const normalized = normalizeVisibility(visibility);
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 text-[10px] uppercase", TONES[normalized], className)}
    >
      {t(`visibility.${normalized}`)}
    </Badge>
  );
}
