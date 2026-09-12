import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  attackModeKey,
  currentShotsFor,
  toWeaponStateMap,
  type WeaponStateRow,
} from "@/lib/weapon-state";
import { RULES_AUDIT as AUDIT, consumeShots, normalizeWeaponMode, reloadAmmo } from "@/rules";

function row(entryId: string, modeKey: string, shots: number): WeaponStateRow {
  return {
    id: `${entryId}-${modeKey}`,
    character_id: "char-1",
    character_entry_id: entryId,
    mode_key: modeKey,
    current_shots: shots,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("weapon state persistence mapping", () => {
  it("derives a deterministic mode key from the index", () => {
    expect(attackModeKey(0)).toBe("mode:0");
    expect(attackModeKey(0)).toBe(attackModeKey(0));
    expect(attackModeKey(1)).not.toBe(attackModeKey(0));
  });

  it("maps rows to per-entry/per-mode current shots", () => {
    const map = toWeaponStateMap([row("e1", "mode:0", 4), row("e2", "mode:0", 7)]);
    expect(currentShotsFor(map, "e1", 0)).toBe(4);
    expect(currentShotsFor(map, "e2", 0)).toBe(7);
  });

  it("isolates state per entry and per mode index", () => {
    const map = toWeaponStateMap([row("e1", "mode:1", 2)]);
    expect(currentShotsFor(map, "e1", 0)).toBeUndefined();
    expect(currentShotsFor(map, "e9", 1)).toBeUndefined();
  });
});

describe("state initialization and fire/reload flow", () => {
  const mode = { name: "Test Sidearm", damage: "1d+1 pi", shots: "8(3)", rof: "3", recoil: "2" };

  it("falls back to parsed capacity when nothing is persisted", () => {
    const weapon = normalizeWeaponMode(mode, { st: 10 });
    expect(weapon.ammo?.current).toBe(8);
    expect(weapon.ammo?.capacity).toBe(8);
  });

  it("initializes from persisted current shots", () => {
    const map = toWeaponStateMap([row("e1", attackModeKey(0), 3)]);
    const persisted = currentShotsFor(map, "e1", 0)!;
    const weapon = normalizeWeaponMode(mode, { st: 10, currentShots: persisted });
    expect(weapon.ammo?.current).toBe(3);
    expect(weapon.ammo?.capacity).toBe(8);
  });

  it("fire then reload produce the values that get persisted, without mutating the definition", () => {
    const weapon = normalizeWeaponMode(mode, { st: 10, currentShots: 2 });
    const fired = consumeShots(weapon.ammo!, 1);
    expect(fired.ok && fired.state.current).toBe(1);
    expect(weapon.ammo!.current).toBe(2);
    expect(reloadAmmo(fired.ok ? fired.state : weapon.ammo!).current).toBe(8);
    expect(mode.shots).toBe("8(3)");
  });
});

describe("audit after persistence", () => {
  it("no longer reports ammo persistence as MISSING and keeps zero approximations", () => {
    const entry = AUDIT.find((e) => e.id === "combat.ammo-persistence");
    expect(entry?.status).toBe("CONFIGURABLE");
    expect(AUDIT.filter((e) => e.status === "APPROXIMATION")).toHaveLength(0);
    expect(AUDIT.filter((e) => e.status === "MISSING")).toHaveLength(0);
  });
});
