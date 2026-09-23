/**
 * Canonical bounds for the campaign settings that both the assistant (MCP)
 * tool contract and the UCF-CAMPAIGN-PACKAGE v1 schema expose as first-level,
 * independently-settable fields.
 *
 * The two schemas are built from different zod major versions (`zod/v4` for
 * MCP, `zod` v3 for the package format) so their schema objects cannot be
 * shared directly, but every numeric range lives here once — neither side may
 * hand-write its own copy of a min/max, so the two can never drift apart the
 * way `quirk_limit` once did (present in the package format, missing from the
 * MCP tools).
 */

export interface CampaignSettingRange {
  readonly min: number;
  readonly max: number;
}

export const CAMPAIGN_SETTING_RANGES = {
  point_limit: { min: 0, max: 100000 },
  disadvantage_limit: { min: -100000, max: 0 },
  quirk_limit: { min: -100000, max: 100000 },
  tech_level: { min: 0, max: 20 },
} as const satisfies Record<string, CampaignSettingRange>;

export type CampaignSettingRangeKey = keyof typeof CAMPAIGN_SETTING_RANGES;

/** Shared max length for the free-text house rules setting. */
export const HOUSE_RULES_MAX_LENGTH = 20000;
