import type { CreativeSettings } from "@/lib/adaptation/api";
import { BOOK_LENGTH_MODES } from "@/lib/adaptation/protocol";
import type { TargetFlags } from "@/lib/adaptation/types";

/**
 * Minimum configuration for the book targets. Only selected targets are
 * checked, so an unselected format never blocks the others.
 */
export function targetConfigProblems(
  project: TargetFlags & { creative_settings?: CreativeSettings | null },
): ("noBookConfig" | "noModuleConfig")[] {
  const creative = project.creative_settings ?? {};
  const out: ("noBookConfig" | "noModuleConfig")[] = [];
  if (project.target_book_narrative) {
    const book = creative.book_narrative ?? {};
    const mode = book.length_mode ?? "auto";
    if (!book.title?.trim() || !(BOOK_LENGTH_MODES as readonly string[]).includes(mode))
      out.push("noBookConfig");
  }
  if (project.target_adventure_module) {
    const module = creative.adventure_module ?? {};
    const min = module.players_min ?? 3;
    const max = module.players_max ?? 5;
    if (
      !module.title?.trim() ||
      (module.game_system && module.game_system !== "gurps_4e") ||
      (module.adaptation_level && module.adaptation_level !== "complete_module") ||
      min < 1 ||
      max < min
    )
      out.push("noModuleConfig");
  }
  return out;
}
