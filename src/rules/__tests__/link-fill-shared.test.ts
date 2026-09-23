/**
 * P0-03: the sheet UI and the assistant must fill missing definition fields
 * through ONE implementation. This pins that there is a single helper and
 * that both entry points reference it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fillMissingDefinition } from "@/lib/pack-link";
import { fillMissingDefinition as assistantFill } from "@/lib/mcp/pack-link.server";

describe("shared fill-missing-definition helper", () => {
  it("the assistant re-exports the very same function the UI uses", () => {
    expect(assistantFill).toBe(fillMissingDefinition);
  });

  it("the UI link action calls it", () => {
    const source = readFileSync("src/lib/pack-link-service.ts", "utf8");
    expect(source).toContain("fillMissingDefinition(entry, item)");
  });

  it("the assistant link action calls it", () => {
    const source = readFileSync("src/lib/mcp/domains/character-entries.server.ts", "utf8");
    expect(source).toContain("fillMissingDefinition(");
  });
});
