/**
 * Assistant-connection resume handoff.
 *
 * When an external assistant sends someone to the consent screen while they are
 * signed out, we remember ONLY the authorization id so the consent screen can be
 * reopened after the normal sign-in flow lands on the dashboard.
 *
 * Deliberately narrow: no URLs are ever stored, the value expires quickly, and
 * it is consumed exactly once. Nothing here touches the app's auth flow.
 */

export const MCP_PENDING_AUTHORIZATION_KEY = "ucf.mcp.pending-authorization";

/** Ten minutes. A consent handoff older than this is treated as stale. */
export const MCP_PENDING_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

const MAX_ID_LENGTH = 200;

export interface PendingAuthorizationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Authorization ids are opaque identifiers. We accept a bounded,
 * URL-safe string and nothing else.
 */
export function isValidAuthorizationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    /^[A-Za-z0-9._~-]+$/.test(value)
  );
}

function defaultStorage(): PendingAuthorizationStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberPendingAuthorization(
  authorizationId: unknown,
  storage: PendingAuthorizationStorage | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage || !isValidAuthorizationId(authorizationId)) return false;
  try {
    storage.setItem(
      MCP_PENDING_AUTHORIZATION_KEY,
      JSON.stringify({ authorizationId, savedAt: now }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearPendingAuthorization(
  storage: PendingAuthorizationStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(MCP_PENDING_AUTHORIZATION_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * Reads and removes the pending authorization. Returns `null` when nothing is
 * stored, the stored value is malformed, or it is older than the TTL.
 */
export function consumePendingAuthorization(
  storage: PendingAuthorizationStorage | null = defaultStorage(),
  now: number = Date.now(),
): string | null {
  if (!storage) return null;

  let raw: string | null = null;
  try {
    raw = storage.getItem(MCP_PENDING_AUTHORIZATION_KEY);
  } catch {
    return null;
  }
  clearPendingAuthorization(storage);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const { authorizationId, savedAt } = parsed as {
    authorizationId?: unknown;
    savedAt?: unknown;
  };
  if (!isValidAuthorizationId(authorizationId)) return null;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (savedAt > now) return null;
  if (now - savedAt > MCP_PENDING_AUTHORIZATION_TTL_MS) return null;

  return authorizationId;
}
