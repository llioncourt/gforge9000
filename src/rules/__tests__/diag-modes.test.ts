import { describe, expect, it } from "vitest";

import { resolveDiagFlags } from "@/lib/diag-modes";

describe("diagnostic modes", () => {
  it("no diag preserves current behavior on /auth", () => {
    expect(resolveDiagFlags("/auth", "")).toEqual({
      mode: null,
      skipPwaCleanup: false,
      skipRootAuthListener: false,
      trace: false,
    });
  });

  it("diag=nopwa disables only the PWA cleanup", () => {
    const flags = resolveDiagFlags("/auth", "?diag=nopwa");
    expect(flags.skipPwaCleanup).toBe(true);
    expect(flags.skipRootAuthListener).toBe(false);
    expect(flags.trace).toBe(false);
  });

  it("diag=noauthroot disables only the root auth listener", () => {
    const flags = resolveDiagFlags("/auth", "?diag=noauthroot");
    expect(flags.skipPwaCleanup).toBe(false);
    expect(flags.skipRootAuthListener).toBe(true);
  });

  it("diag=bare disables both", () => {
    const flags = resolveDiagFlags("/auth", "?diag=bare");
    expect(flags.skipPwaCleanup).toBe(true);
    expect(flags.skipRootAuthListener).toBe(true);
  });

  it("diag=trace only enables safe console tracing", () => {
    const flags = resolveDiagFlags("/auth", "?diag=trace");
    expect(flags).toEqual({
      mode: "trace",
      skipPwaCleanup: false,
      skipRootAuthListener: false,
      trace: true,
    });
  });

  it("ignores unknown diag values", () => {
    expect(resolveDiagFlags("/auth", "?diag=whatever").mode).toBeNull();
  });

  it("leaves non-/auth routes unaffected", () => {
    for (const path of ["/", "/dashboard", "/auth/callback", "/authx", "/campaigns/1"]) {
      expect(resolveDiagFlags(path, "?diag=bare")).toEqual({
        mode: null,
        skipPwaCleanup: false,
        skipRootAuthListener: false,
        trace: false,
      });
    }
  });

  it("tolerates a trailing slash and extra query params on /auth", () => {
    expect(resolveDiagFlags("/auth/", "?x=1&diag=bare").skipPwaCleanup).toBe(true);
  });
});
