/**
 * P0-03: the destructive wipe confirmation must derive from the signed
 * session token, never from client storage. See `docs/security/wipe-reauth.md`
 * for the server-side enforcement that is still deferred.
 */
import { describe, expect, it } from "vitest";
import { authAgeSeconds, decodeJwtClaims, hasRecentAuth } from "@/lib/reauth";

function token(payload: Record<string, unknown>): string {
  const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify(payload))}.sig`;
}

const NOW = 1_700_000_000_000;
const nowSec = Math.floor(NOW / 1000);

describe("recent authentication", () => {
  it("reads the newest amr timestamp", () => {
    const t = token({
      iat: nowSec - 3600,
      amr: [
        { method: "password", timestamp: nowSec - 3600 },
        { method: "oauth", timestamp: nowSec - 30 },
      ],
    });
    expect(authAgeSeconds(t, NOW)).toBe(30);
    expect(hasRecentAuth(t, NOW)).toBe(true);
  });

  it("falls back to auth_time, then iat", () => {
    expect(authAgeSeconds(token({ auth_time: nowSec - 60 }), NOW)).toBe(60);
    expect(authAgeSeconds(token({ iat: nowSec - 60 }), NOW)).toBe(60);
  });

  it("rejects a session that authenticated long ago", () => {
    const t = token({ amr: [{ method: "password", timestamp: nowSec - 4000 }] });
    expect(hasRecentAuth(t, NOW)).toBe(false);
  });

  it("fails closed with no token, a malformed token, or no timestamp claim", () => {
    expect(hasRecentAuth(null, NOW)).toBe(false);
    expect(hasRecentAuth("not-a-jwt", NOW)).toBe(false);
    expect(authAgeSeconds(token({ sub: "u1" }), NOW)).toBeNull();
    expect(hasRecentAuth(token({ sub: "u1" }), NOW)).toBe(false);
  });

  it("never returns anything for an empty payload segment", () => {
    expect(decodeJwtClaims("a..c")).toBeNull();
  });
});
