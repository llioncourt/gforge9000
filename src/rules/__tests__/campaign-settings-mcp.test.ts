/**
 * P0-04 — `quirk_limit` is a first-class campaign setting everywhere.
 *
 * The MCP create/update campaign tools, the UCF-CAMPAIGN-PACKAGE v1 schema and
 * the app all read their numeric bounds from one canonical module, so the three
 * cannot drift apart again.
 */

import { describe, expect, it } from "vitest";

import { CAMPAIGN_SETTING_RANGES } from "@/lib/campaign-settings";
import { campaignSettingFields, campaignSettingsPatch } from "@/lib/mcp/domains/shared.server";

describe("campaign settings exposed by the assistant tools", () => {
  it("includes quirk_limit alongside the other first-level settings", () => {
    expect(Object.keys(campaignSettingFields)).toEqual(
      expect.arrayContaining([
        "point_limit",
        "disadvantage_limit",
        "quirk_limit",
        "tech_level",
        "house_rules",
        "allowed_packs",
        "cover_path",
        "ruleset_overrides",
      ]),
    );
  });

  it("accepts a negative quirk limit, like the disadvantage limit", () => {
    expect(campaignSettingFields.quirk_limit.parse(-5)).toBe(-5);
    expect(CAMPAIGN_SETTING_RANGES.quirk_limit.min).toBeLessThanOrEqual(-5);
  });

  it("rejects a value outside the canonical range", () => {
    expect(() =>
      campaignSettingFields.quirk_limit.parse(CAMPAIGN_SETTING_RANGES.quirk_limit.min - 1),
    ).toThrow();
  });
});

describe("campaign settings patch construction", () => {
  it("leaves an omitted quirk_limit untouched", () => {
    expect(campaignSettingsPatch({ point_limit: 150 })).toEqual({ point_limit: 150 });
  });

  it("carries an explicit value through", () => {
    expect(campaignSettingsPatch({ quirk_limit: -5 })).toEqual({ quirk_limit: -5 });
  });

  it("keeps an explicit null as a removal instruction", () => {
    expect(campaignSettingsPatch({ quirk_limit: null })).toEqual({ quirk_limit: null });
  });

  it("treats undefined the same as omission", () => {
    expect(campaignSettingsPatch({ quirk_limit: undefined, tech_level: 8 })).toEqual({
      tech_level: 8,
    });
  });

  it("ignores keys that are not campaign settings", () => {
    expect(campaignSettingsPatch({ quirk_limit: -3, not_a_setting: 1 })).toEqual({
      quirk_limit: -3,
    });
  });
});
