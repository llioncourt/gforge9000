import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public sign-in navigation", () => {
  it("uses a document navigation for every landing-page link to /auth", () => {
    const source = readFileSync("src/routes/index.tsx", "utf8");
    const authLinks = [...source.matchAll(/<Link\s+to="\/auth"([^>]*)>/g)];

    expect(authLinks).toHaveLength(2);
    for (const link of authLinks) {
      expect(link[1]).toMatch(/\breloadDocument\b/);
    }

  });
});