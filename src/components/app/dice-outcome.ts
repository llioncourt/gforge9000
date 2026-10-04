/** Text colour for a roll outcome, shared by the dice tray, overlay and roll log. */
export function outcomeTone(outcome: string | null) {
  switch (outcome) {
    case "critical success":
      return "text-success";
    case "success":
      return "text-foreground";
    case "critical failure":
      return "text-destructive";
    case "failure":
      return "text-destructive/80";
    default:
      return "text-muted-foreground";
  }
}
