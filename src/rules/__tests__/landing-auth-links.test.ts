import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regression: the two landing-page auth CTAs (header "nav.signIn" and hero
 * "hero.startBuilding") MUST use native full-document navigation
 * (<a href="/auth">), not client-side routing. Owner-verified production
 * evidence: direct /auth works, but SPA transition / -> /auth froze.
 */
const source = readFileSync(
  fileURLToPath(new URL("../../routes/index.tsx", import.meta.url)),
  "utf8",
);

describe("landing auth CTAs use full-document navigation", () => {
  it("header sign-in CTA is a native anchor to /auth", () => {
    expect(source).toContain('<a href="/auth">{t("nav.signIn")}</a>');
    expect(source).not.toContain('<Link to="/auth">{t("nav.signIn")}</Link>');
  });

  it("hero start-building CTA is a native anchor to /auth", () => {
    expect(source).toContain('<a href="/auth">{t("hero.startBuilding")}</a>');
    expect(source).not.toContain('<Link to="/auth">{t("hero.startBuilding")}</Link>');
  });

  it("no client-side Link points at /auth anywhere on the landing page", () => {
    expect(source).not.toMatch(/<Link[^>]*to="\/auth"/);
  });
});
