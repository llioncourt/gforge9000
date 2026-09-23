/**
 * Browser Google sign-in path.
 *
 * Production evidence: the project's own Supabase Google provider has no
 * OAuth secret, so `/auth/v1/authorize?provider=google` answers HTTP 400
 * ("missing OAuth secret") before the browser ever reaches Google. The
 * managed hosted initiate path answers 302 on both the published and preview
 * sites. Sign-in therefore goes through the managed helper, from ONE
 * app-owned function shared by login and destructive reauthentication.
 *
 * What this file proves: the helper uses the managed provider with the
 * canonical origin redirect, never calls the project's own Supabase OAuth
 * endpoint, surfaces initiation failures instead of silently looping, and
 * recognises a failed/expired provider return. Completing a real Google
 * consent screen still requires manual validation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOAuth = vi.fn();
const supabaseSignInWithOAuth = vi.fn();

vi.mock("@/integrations/lovable", () => ({
  lovable: { auth: { signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a) } },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithOAuth: (...a: unknown[]) => supabaseSignInWithOAuth(...a) } },
}));
vi.mock("@/lib/auth-redirect", () => ({ getAuthRedirectUri: () => "https://app.example" }));

const { signInWithGoogle, readOAuthReturnError } = await import("@/lib/browser-auth");

describe("browser Google sign-in", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
    supabaseSignInWithOAuth.mockReset();
  });

  it("uses the managed provider with the canonical origin redirect", async () => {
    signInWithOAuth.mockResolvedValue({ redirected: true });
    const result = await signInWithGoogle();
    expect(result.error).toBeNull();
    expect(signInWithOAuth).toHaveBeenCalledWith("google", { redirect_uri: "https://app.example" });
  });

  it("never calls the project's own Supabase OAuth endpoint (it has no Google secret)", async () => {
    signInWithOAuth.mockResolvedValue({ redirected: true });
    await signInWithGoogle();
    expect(supabaseSignInWithOAuth).not.toHaveBeenCalled();
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
