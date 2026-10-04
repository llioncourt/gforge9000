import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("../../routes/index.tsx", import.meta.url)),
  "utf8",
);
const authSource = readFileSync(
  fileURLToPath(new URL("../../routes/auth.tsx", import.meta.url)),
  "utf8",
);

describe("root route uses the existing authentication page", () => {
  it("redirects the root route to /auth before rendering content", () => {
    expect(source).toContain('throw redirect({ to: "/auth" });');
    expect(source).not.toContain("component:");
  });

  it("contains no remaining landing-page content", () => {
    expect(source).not.toContain("function Landing");
    expect(source).not.toContain("hero.startBuilding");
    expect(source).not.toContain("FEATURE_KEYS");
  });

  it("keeps the authentication route as the destination", () => {
    expect(authSource).toContain('createFileRoute("/auth")');
    expect(authSource).toContain("component: AuthPage");
  });
});
