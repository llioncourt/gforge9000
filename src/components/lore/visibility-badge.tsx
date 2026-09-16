import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type VisibilityBadgeProps = {
  visibility: string | boolean | null | undefined;
  isGm: boolean;
  className?: string;
};

const PRIVATE_VALUES = new Set(["GM_ONLY", "UNREVEALED", "PRIVATE", "GM"]);
const SHARED_VALUES = new Set(["ALL_PLAYERS", "PUBLIC", "PLAYERS", "SHARED"]);

function visibilityPresentation(value: string | boolean | null | undefined) {
  const normalized = typeof value === "boolean" ? (value ? "SHARED" : "GM_ONLY") : String(value ?? "GM_ONLY").toUpperCase();

  if (normalized === "SELECTED_PLAYERS") {
    return {
      label: "Selected players",
      className: "border-warning/50 bg-warning/15 text-warning",
    };
  }
  if (SHARED_VALUES.has(normalized)) {
    return {
      label: normalized === "PUBLIC" ? "Public" : "All players",
      className: "border-success/50 bg-success/15 text-success",
    };
  }
  if (PRIVATE_VALUES.has(normalized)) {
    return {
      label: normalized === "UNREVEALED" ? "Unrevealed" : "GM only",
      className: "border-destructive/50 bg-destructive/15 text-destructive",
    };
  }
  return {
    label: String(value ?? "GM only"),
    className: "border-muted-foreground/40 bg-muted text-muted-foreground",
  };
}

export function VisibilityBadge({ visibility, isGm, className }: VisibilityBadgeProps) {
  if (!isGm) return null;
  const presentation = visibilityPresentation(visibility);
  return (
    <Badge
      variant="outline"
      className={cn("shrink-0 text-[10px] uppercase", presentation.className, className)}
    >
      {presentation.label}
    </Badge>
  );
}