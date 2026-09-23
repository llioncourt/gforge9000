import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public sign-in navigation", () => {
  it("does not auto-redirect from /auth based on a cached session snapshot", () => {
    const source = readFileSync("src/routes/auth.tsx", "utf8");

    expect(source).not.toContain("useSession");
    expect(source).not.toMatch(/useEffect\([\s\S]*navigate\(\{ to: "\/dashboard"/);
  });
});
