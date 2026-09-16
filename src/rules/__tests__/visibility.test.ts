import { describe, expect, it } from "vitest";
import {
  isGmOnly,
  isPlayerVisible,
  normalizeVisibility,
  toPackageVisibility,
  visibilityForReveal,
  visibilityLabel,
} from "@/lib/visibility";

describe("normalizeVisibility", () => {
  it("maps legacy package words onto canonical values", () => {
    expect(normalizeVisibility("gm")).toBe("GM_ONLY");
    expect(normalizeVisibility("players")).toBe("ALL_PLAYERS");
    expect(normalizeVisibility("public")).toBe("PUBLIC");
    expect(normalizeVisibility("private")).toBe("GM_ONLY");
    expect(normalizeVisibility("shared")).toBe("ALL_PLAYERS");
  });

  it("keeps canonical values untouched", () => {
    expect(normalizeVisibility("SELECTED_PLAYERS")).toBe("SELECTED_PLAYERS");
    expect(normalizeVisibility("UNREVEALED")).toBe("UNREVEALED");
  });

  it("handles booleans and unknown input safely", () => {
    expect(normalizeVisibility(true)).toBe("ALL_PLAYERS");
    expect(normalizeVisibility(false)).toBe("GM_ONLY");
    expect(normalizeVisibility(null)).toBe("GM_ONLY");
    expect(normalizeVisibility("whatever")).toBe("GM_ONLY");
  });
});

describe("player access helpers", () => {
  it("treats only all-players and public as open", () => {
    expect(isPlayerVisible("players")).toBe(true);
    expect(isPlayerVisible("PUBLIC")).toBe(true);
    expect(isPlayerVisible("SELECTED_PLAYERS")).toBe(false);
    expect(isPlayerVisible("gm")).toBe(false);
  });

  it("flags GM-only and unrevealed records", () => {
    expect(isGmOnly("gm")).toBe(true);
    expect(isGmOnly("UNREVEALED")).toBe(true);
    expect(isGmOnly("SELECTED_PLAYERS")).toBe(false);
  });
});

describe("visibilityForReveal", () => {
  it("promotes GM-only records so a grant takes effect", () => {
    expect(visibilityForReveal("GM_ONLY")).toBe("SELECTED_PLAYERS");
    expect(visibilityForReveal("gm")).toBe("SELECTED_PLAYERS");
    expect(visibilityForReveal("UNREVEALED")).toBe("SELECTED_PLAYERS");
  });

  it("leaves already-shared records alone", () => {
    expect(visibilityForReveal("SELECTED_PLAYERS")).toBeNull();
    expect(visibilityForReveal("ALL_PLAYERS")).toBeNull();
    expect(visibilityForReveal("PUBLIC")).toBeNull();
  });
});

describe("labels and package round-trip", () => {
  it("labels legacy values with the canonical wording", () => {
    expect(visibilityLabel("players")).toBe("All players");
    expect(visibilityLabel("gm")).toBe("GM only");
  });

  it("round-trips through the package vocabulary", () => {
    expect(toPackageVisibility("ALL_PLAYERS")).toBe("players");
    expect(toPackageVisibility("SELECTED_PLAYERS")).toBe("gm");
    expect(normalizeVisibility(toPackageVisibility("PUBLIC"))).toBe("PUBLIC");
  });
});
