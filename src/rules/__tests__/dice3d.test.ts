import { describe, expect, it } from "vitest";
import {
  FACES,
  createDice,
  facesOf,
  quatFromAxisAngle,
  simulateToRest,
  snapQuat,
  stepDice,
  topFaceValue,
} from "@/lib/dice3d";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("3D dice face mapping", () => {
  it("defines six distinct faces with opposite faces summing to seven", () => {
    expect(FACES).toHaveLength(6);
    expect(new Set(FACES.map((f) => f.value))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    for (const f of FACES) {
      const opposite = FACES.find(
        (o) =>
          o.normal[0] === -f.normal[0] &&
          o.normal[1] === -f.normal[1] &&
          o.normal[2] === -f.normal[2],
      );
      expect(opposite).toBeDefined();
      expect(f.value + opposite!.value).toBe(7);
    }
  });

  it("reads the up-facing value from orientation", () => {
    const identity: [number, number, number, number] = [0, 0, 0, 1];
    const up = topFaceValue(identity);
    expect(up).toBeGreaterThanOrEqual(1);
    expect(up).toBeLessThanOrEqual(6);
    // Flipping 180° about X must show the opposite face.
    const flipped = quatFromAxisAngle([1, 0, 0], Math.PI);
    expect(up + topFaceValue(flipped)).toBe(7);
  });

  it("snapping to the nearest axis keeps the same visible value", () => {
    const r = rng(7);
    for (let i = 0; i < 40; i++) {
      const q = quatFromAxisAngle(
        [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1],
        r() * Math.PI * 2,
      );
      const before = topFaceValue(q);
      const after = topFaceValue(snapQuat(q));
      expect(after).toBe(before);
    }
  });
});

describe("3D dice simulation", () => {
  it("settles every die and yields legal d6 values", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { dice, faces } = simulateToRest(3, rng(seed));
      expect(dice.every((d) => d.settled)).toBe(true);
      expect(faces).toHaveLength(3);
      for (const f of faces) {
        expect(Number.isInteger(f)).toBe(true);
        expect(f).toBeGreaterThanOrEqual(1);
        expect(f).toBeLessThanOrEqual(6);
      }
    }
  });

  it("is deterministic for a given seed", () => {
    expect(simulateToRest(3, rng(42)).faces).toEqual(simulateToRest(3, rng(42)).faces);
  });

  it("produces a varied distribution across seeds", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      for (const f of simulateToRest(3, rng(seed)).faces) seen.add(f);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it("keeps dice inside the tray while stepping", () => {
    let dice = createDice(3, rng(9));
    for (let i = 0; i < 400; i++) dice = stepDice(dice, 1 / 90);
    for (const d of dice) {
      expect(Math.abs(d.pos[0])).toBeLessThanOrEqual(3.6);
      expect(Math.abs(d.pos[2])).toBeLessThanOrEqual(2.6);
      expect(d.pos[1]).toBeGreaterThan(0);
    }
    expect(facesOf(dice).every((f) => f >= 1 && f <= 6)).toBe(true);
  });
});
