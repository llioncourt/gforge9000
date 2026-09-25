import { describe, expect, it } from "vitest";
import { soundFxReachesUser } from "@/lib/campaign-sound-fx";

describe("targeted sound effects", () => {
  it("reaches everyone when no target is set", () => {
    expect(soundFxReachesUser(null, "a")).toBe(true);
    expect(soundFxReachesUser(undefined, "a")).toBe(true);
    expect(soundFxReachesUser([], "a")).toBe(true);
  });

  it("reaches only the listed members", () => {
    expect(soundFxReachesUser(["a", "b"], "b")).toBe(true);
    expect(soundFxReachesUser(["a", "b"], "c")).toBe(false);
  });
});
