import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public sign-in navigation", () => {
  it("does not auto-redirect from /auth based on a cached session snapshot", () => {
    const source = readFileSync("src/routes/auth.tsx", "utf8");

    expect(source).not.toContain("useSession");

    // No effect on the sign-in page may navigate; navigation only happens as a
    // result of an explicit successful sign-in/sign-up submit.
    const effectBodies = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[/g)].map(
      (match) => match[1],
    );
    for (const body of effectBodies) {
      expect(body).not.toContain("navigate(");
    }
  });
});
