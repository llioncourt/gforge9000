/**
 * Assistant-side helpers for the optional pack link on character entries.
 *
 * All of the real logic lives in the shared modules (`src/lib/pack-link.ts`,
 * `pack-match.ts`, `pack-link-service.ts`) that the character sheet uses too,
 * so the assistant and the UI can never disagree about what "official",
 * "modified", "custom" or "stale" means.
 */

import type { McpToolContext, Structured } from "@/lib/mcp/kit.server";
import { findPackMatch, type PackCandidate } from "@/lib/pack-match";
import {
  buildLink,
  deriveStatuses,
  loadCampaignSettings,
  requireLinkableItem,
  type EntryRowLike,
} from "@/lib/pack-link-service";
import {
  expectedLeveledCost,
  isSkillLike,
  withPackLink,
  withoutPackLink,
  type PackLink,
  type PackLinkMethod,
  type PackLinkStatus,
} from "@/lib/pack-link";

export interface LinkFlags {
  pack_entry_id?: string | undefined;
  match_pack?: boolean | undefined;
  unlink?: boolean | undefined;
}

/** The three pack options are mutually exclusive. */
export function assertLinkFlags(flags: LinkFlags): void {
  const direct = Boolean(flags.pack_entry_id);
  const match = flags.match_pack === true;
  const unlink = flags.unlink === true;
  if (direct && match) throw new Error("Use either pack_entry_id or match_pack, not both.");
  if (direct && unlink) throw new Error("Use either pack_entry_id or unlink, not both.");
  if (match && unlink) throw new Error("Use either match_pack or unlink, not both.");
}

export function candidateView(candidate: PackCandidate): Structured {
  return {
    id: candidate.id,
    name: candidate.name,
    kind: candidate.kind,
    category: candidate.category,
    pack_id: candidate.pack_id,
    pack_name: candidate.pack_name,
    base_points: candidate.base_points,
    cost_per_level: candidate.cost_per_level,
    max_levels: candidate.max_levels,
    difficulty: candidate.difficulty,
    attribute: candidate.attribute,
    defaults: candidate.defaults,
    prerequisites: candidate.prerequisites,
    specialization: candidate.specialization,
    specialization_required: candidate.specialization_required,
    pack_version: candidate.pack_version ?? null,
  };
}

export interface ResolvedTarget {
  item: PackCandidate | null;
  method: PackLinkMethod | null;
  /** Ambiguous matches never write; the candidate list is returned instead. */
  ambiguous: PackCandidate[] | null;
  specialization: string;
}

/** Resolves the pack item a call refers to, without writing anything. */
export async function resolveTarget(
  ctx: McpToolContext,
  flags: LinkFlags,
  query: { kind: string; name: string; category?: string | null | undefined },
  campaignSettings: unknown,
): Promise<ResolvedTarget> {
  if (flags.pack_entry_id) {
    const item = await requireLinkableItem(ctx.supabase, flags.pack_entry_id, campaignSettings);
    return { item, method: "manual", ambiguous: null, specialization: "" };
  }
  if (flags.match_pack === true) {
    const result = await findPackMatch(ctx.supabase, query, { campaignSettings });
    if (result.status === "ambiguous") {
      return {
        item: null,
        method: null,
        ambiguous: result.candidates,
        specialization: result.specialization,
      };
    }
    if (result.status === "unique" && result.item) {
      return {
        item: result.item,
        method: "match_name",
        ambiguous: null,
        specialization: result.specialization,
      };
    }
  }
  return { item: null, method: null, ambiguous: null, specialization: "" };
}

/**
 * Mechanical fields the pack defines and the caller did not supply. Character
 * choices that were supplied are never overwritten.
 */
export function definitionFill(
  item: PackCandidate,
  supplied: {
    category?: string | null | undefined;
    points?: number | undefined;
    levels?: number | undefined;
  },
  kind: string,
  specialization: string,
): { category?: string | null; points?: number; levels?: number; data?: Record<string, unknown> } {
  const out: {
    category?: string | null;
    points?: number;
    levels?: number;
    data?: Record<string, unknown>;
  } = {};
  if (supplied.category === undefined && item.category) out.category = item.category;

  const levels = supplied.levels ?? 1;
  if (supplied.points === undefined) {
    out.points = isSkillLike(kind)
      ? Number(item.base_points ?? 0)
      : expectedLeveledCost(
          Number(item.base_points ?? 0),
          Number(item.cost_per_level ?? 0),
          levels,
        );
  }

  const data: Record<string, unknown> = {};
  if (isSkillLike(kind)) {
    if (item.attribute) data["attribute"] = item.attribute;
    if (item.difficulty) data["difficulty"] = item.difficulty;
    if (item.defaults) data["defaults"] = item.defaults;
    if (item.prerequisites) data["prerequisites"] = item.prerequisites;
    if (item.specialization_required) data["specialization_required"] = true;
    if (supplied.points !== undefined) data["points"] = supplied.points;
  }
  if (specialization) data["specialization"] = specialization;
  if (Object.keys(data).length) out.data = data;
  return out;
}

export async function sourceWithLink(
  existingSource: unknown,
  item: PackCandidate,
  method: PackLinkMethod,
): Promise<{ source: Record<string, unknown>; link: PackLink }> {
  const link = await buildLink(item, method);
  const base = { ...(existingSource && typeof existingSource === "object" ? existingSource : {}) };
  const withPack = { ...base, pack: item.pack_name ?? item.pack ?? null };
  return { source: withPackLink(withPack, link), link };
}

export function sourceWithoutLink(existingSource: unknown): Record<string, unknown> {
  return withoutPackLink(existingSource);
}

/** Derived state for one entry, ready to be attached to a tool response. */
export async function statusFor(
  ctx: McpToolContext,
  entry: EntryRowLike,
  campaignSettings: unknown,
): Promise<PackLinkStatus> {
  const statuses = await deriveStatuses(ctx.supabase, [entry], campaignSettings);
  return statuses.get(entry.id) ?? { state: "custom", link: null };
}

export async function settingsForCharacter(
  ctx: McpToolContext,
  campaignId: string | null,
): Promise<unknown> {
  return loadCampaignSettings(ctx.supabase, campaignId);
}

/** Response payload shared by add/update: the row plus its derived pack state. */
export function withPackState(row: Structured, status: PackLinkStatus): Structured {
  return {
    ...row,
    pack_state: status.state,
    pack_link: status.link,
    ...(status.stale_reason ? { stale_reason: status.stale_reason } : {}),
    ...(status.diff && status.diff.length ? { diff: status.diff } : {}),
    ...(status.current_version ? { current_pack_version: status.current_version } : {}),
  };
}
