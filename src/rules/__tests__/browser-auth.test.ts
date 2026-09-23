/**
 * P0-01 regression: the browser Google sign-in path. The old path navigated
 * to the Lovable broker's relative `/~oauth/initiate` URL, which does not
 * exist on this app's origin, so the browser never reached Google and no
 * session was ever created. Sign-in now goes through Supabase's own provider,
 * from ONE app-owned helper shared by login and destructive reauthentication.
 *
 * What this file proves: the helper calls native Supabase OAuth with the
 * canonical origin redirect, surfaces initiation failures instead of
 * silently looping, and recognises a failed/expired provider return.
 * Completing a real Google consent screen still requires manual validation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOAuth = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a) } },
}));
vi.mock("@/lib/auth-redirect", () => ({ getAuthRedirectUri: () => "https://app.example" }));

const { signInWithGoogle, readOAuthReturnError } = await import("@/lib/browser-auth");

describe("browser Google sign-in", () => {
  beforeEach(() => signInWithOAuth.mockReset());

  it("uses the native Supabase provider with the canonical origin redirect", async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    const result = await signInWithGoogle();
    expect(result.error).toBeNull();
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://app.example" },
    });
  });

  it("never navigates through the broker path", async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    await signInWithGoogle();
    const call = JSON.stringify(signInWithOAuth.mock.calls[0]);
    expect(call).not.toContain("~oauth");
  });

  it("returns the error when initiation fails", async () => {
    signInWithOAuth.mockResolvedValue({ error: new Error("Unsupported provider") });
    const result = await signInWithGoogle("reauth");
    expect(result.error?.message).toBe("Unsupported provider");
  });
});

describe("provider return", () => {
  it("reports a query-string failure", () => {
    expect(
      readOAuthReturnError({ search: "?error=access_denied&error_description=Denied", hash: "" }),
    ).toBe("Denied");
  });

  it("reports a hash-fragment failure", () => {
    expect(readOAuthReturnError({ search: "", hash: "#error=server_error" })).toBe("server_error");
  });

  it("stays silent on a clean return", () => {
    expect(readOAuthReturnError({ search: "?code=abc", hash: "" })).toBeNull();
  });
});
