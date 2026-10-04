import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  AUTH_BOUNCE_WINDOW_MS,
  markAuthBounce,
  mustStayOnSignIn,
  shouldLeaveSignIn,
  wasJustBounced,
  type BounceStorage,
} from "@/lib/auth-landing";

function memoryStorage(): BounceStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const PLAIN = { hash: "", search: "" };

describe("public sign-in navigation", () => {
  it("does not subscribe the sign-in page to the shared session store", () => {
    const source = readFileSync("src/routes/auth.tsx", "utf8");
    expect(source).not.toContain("useSession");
  });

  it("only ever leaves on its own through the single shared decision", () => {
    const source = readFileSync("src/routes/auth.tsx", "utf8");

    // Navigation happens after an explicit successful submit, or once when
    // `shouldLeaveSignIn` says an existing session should move on. No other
    // effect on the page may navigate.
    const effectBodies = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[/g)].map(
      (match) => match[1] ?? "",
    );
    const navigating = effectBodies.filter((body) => body.includes("navigate("));
    expect(navigating).toHaveLength(1);
    expect(navigating[0]).toContain("shouldLeaveSignIn(");
    expect(navigating[0]).toContain("wasJustBounced()");
  });

  it("sends an existing session on to the app", () => {
    expect(
      shouldLeaveSignIn({ location: PLAIN, hasSession: true, recovering: false, bounced: false }),
    ).toBe(true);
  });

  it("stays when nobody is signed in", () => {
    expect(
      shouldLeaveSignIn({ location: PLAIN, hasSession: false, recovering: false, bounced: false }),
    ).toBe(false);
  });

  it("stays for a password-recovery link, before and after the page switches mode", () => {
    const recoveryHash = { hash: "#access_token=abc&type=recovery", search: "" };
    expect(mustStayOnSignIn(recoveryHash)).toBe(true);
    expect(
      shouldLeaveSignIn({
        location: recoveryHash,
        hasSession: true,
        recovering: false,
        bounced: false,
      }),
    ).toBe(false);
    expect(
      shouldLeaveSignIn({ location: PLAIN, hasSession: true, recovering: true, bounced: false }),
    ).toBe(false);
  });

  it("stays when the address carries an auth error to show", () => {
    expect(
      mustStayOnSignIn({ hash: "#error=access_denied&error_code=otp_expired", search: "" }),
    ).toBe(true);
    expect(mustStayOnSignIn({ hash: "", search: "?error_description=expired" })).toBe(true);
    expect(mustStayOnSignIn({ hash: "#access_token=abc&type=signup", search: "" })).toBe(false);
  });

  it("cannot loop: a visit the protected area just refused stays on sign-in", () => {
    const storage = memoryStorage();
    const now = 1_000_000;
    expect(wasJustBounced(storage, now)).toBe(false);

    markAuthBounce(storage, now);
    expect(wasJustBounced(storage, now + 500)).toBe(true);
    expect(
      shouldLeaveSignIn({
        location: PLAIN,
        hasSession: true,
        recovering: false,
        bounced: wasJustBounced(storage, now + 500),
      }),
    ).toBe(false);

    // A later, unrelated visit is not held back by an old refusal.
    expect(wasJustBounced(storage, now + AUTH_BOUNCE_WINDOW_MS + 1)).toBe(false);
  });

  it("the protected area marks the refusal before redirecting to /auth", () => {
    const source = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
    const mark = source.indexOf("markAuthBounce();");
    const redirect = source.indexOf('throw redirect({ to: "/auth" });');
    expect(mark).toBeGreaterThan(-1);
    expect(redirect).toBeGreaterThan(mark);
  });
});
