/**
 * Knowledge state and spoiler filtering.
 *
 * The rule the whole studio obeys: we never invent knowledge. When the campaign
 * carries no evidence that someone knows something, the answer is `unknown`,
 * not `no` and certainly not `yes`.
 */

import { isGmOnly, isPlayerVisible, normalizeVisibility } from "@/lib/visibility";
import type { KnowledgeLevel, SpoilerPolicy } from "@/lib/adaptation/types";

export interface KnowledgeInput {
  /** Canonical visibility of the underlying record. */
  visibility?: string | boolean | null;
  /** True when the record is flagged as GM-only content (gm_truth, gm_notes…). */
  gmOnly?: boolean;
  /** User ids the GM explicitly revealed the record to. */
  grantedUserIds?: string[];
  /** Player character ids that witnessed the fact in a played session. */
  witnessedByCharacterIds?: string[];
  /** True when a played session recorded this as having actually happened. */
  playedOut?: boolean;
}

export interface KnowledgeState {
  world_truth: boolean;
  gm_knowledge: boolean;
  player_knowledge: KnowledgeLevel;
  character_knowledge: KnowledgeLevel;
  revealed: boolean;
  revealed_to: string[];
  witnessed_by: string[];
}

/**
 * Derives what each audience knows about one fact/scene from the evidence the
 * campaign actually stores.
 */
export function deriveKnowledgeState(input: KnowledgeInput): KnowledgeState {
  const granted = [...new Set(input.grantedUserIds ?? [])].sort();
  const witnessed = [...new Set(input.witnessedByCharacterIds ?? [])].sort();
  const visibility = normalizeVisibility(input.visibility ?? null);
  const openToPlayers = isPlayerVisible(visibility);
  const hidden = isGmOnly(visibility) || input.gmOnly === true;

  const revealed = openToPlayers || granted.length > 0;

  let playerKnowledge: KnowledgeLevel;
  if (openToPlayers) playerKnowledge = "player_knowledge";
  else if (granted.length > 0) playerKnowledge = "revealed";
  else if (hidden) playerKnowledge = "unrevealed";
  else playerKnowledge = "unknown";

  let characterKnowledge: KnowledgeLevel;
  if (witnessed.length > 0) characterKnowledge = "character_knowledge";
  else if (input.playedOut === true && openToPlayers) characterKnowledge = "character_knowledge";
  else characterKnowledge = "unknown";

  return {
    world_truth: true,
    gm_knowledge: true,
    player_knowledge: playerKnowledge,
    character_knowledge: characterKnowledge,
    revealed,
    revealed_to: granted,
    witnessed_by: witnessed,
  };
}

/**
 * Whether an item may appear in an adaptation under the chosen spoiler policy.
 *
 * `custom` keeps everything and leaves the decision to per-item review, so the
 * GM can accept or reject each secret individually in the Canon Review screen.
 */
export function allowedBySpoilerPolicy(
  policy: SpoilerPolicy,
  state: Pick<KnowledgeState, "revealed">,
  gmOnly: boolean,
): boolean {
  if (policy === "include_gm_truth") return true;
  if (policy === "custom") return true;
  // revealed_only
  if (!gmOnly) return true;
  return state.revealed;
}

/** Filters a list under the policy, keeping order stable. */
export function applySpoilerPolicy<T extends { gm_only: boolean; knowledge_state?: unknown }>(
  items: T[],
  policy: SpoilerPolicy,
  knowledgeOf: (item: T) => Pick<KnowledgeState, "revealed">,
): T[] {
  return items.filter((item) => allowedBySpoilerPolicy(policy, knowledgeOf(item), item.gm_only));
}
