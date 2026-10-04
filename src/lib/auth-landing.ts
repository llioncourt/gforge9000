/**
 * Rules for leaving the public sign-in page when a session already exists.
 *
 * Someone who is already signed in and lands on `/auth` (typing the address,
 * opening a bookmark, or following the root redirect) is sent on to the app
 * instead of being asked to sign in again. Three cases must stay on the page:
 *
 * - a password-recovery link, which signs the person in only so they can
 *   choose a new password here;
 * - a return from the protected area that was just refused, so a session the
 *   protected area does not accept can never bounce back and forth;
 * - a provider/link return that carries an error to show.
 *
 * Framework-free so the rules can be unit-tested.
 */

export const AUTH_BOUNCE_KEY = "ucf.auth.bounced-at";

/** A refusal newer than this keeps the person on the sign-in page. */
export const AUTH_BOUNCE_WINDOW_MS = 15_000;

export interface BounceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): BounceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Called by the protected area right before it sends someone to `/auth`. */
export function markAuthBounce(
  storage: BounceStorage | null = defaultStorage(),
  now: number = Date.now(),
): void {
  if (!storage) return;
  try {
    storage.setItem(AUTH_BOUNCE_KEY, String(now));
  } catch {
    /* storage unavailable — the sign-in page simply stays put less strictly */
  }
}

export function clearAuthBounce(storage: BounceStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(AUTH_BOUNCE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function wasJustBounced(
  storage: BounceStorage | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  if (!storage) return false;
  let raw: string | null = null;
  try {
    raw = storage.getItem(AUTH_BOUNCE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at)) return false;
  return now >= at && now - at <= AUTH_BOUNCE_WINDOW_MS;
}

/**
 * True when the address carries a recovery handoff or an auth error, i.e. the
 * page has something to do or show and must not navigate away on its own.
 */
export function mustStayOnSignIn(location: { hash: string; search: string }): boolean {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const search = location.search.startsWith("?") ? location.search.slice(1) : location.search;
  for (const part of [hash, search]) {
    if (!part) continue;
    const params = new URLSearchParams(part);
    if (params.get("type") === "recovery") return true;
    if (params.has("error") || params.has("error_code") || params.has("error_description")) {
      return true;
    }
  }
  return false;
}

export interface SignedInRedirectInput {
  /** `location` as it was when the page opened, before the auth client read it. */
  location: { hash: string; search: string };
  hasSession: boolean;
  /** The page switched to "choose a new password" in the meantime. */
  recovering: boolean;
  bounced: boolean;
}

/** The single decision the sign-in page makes about leaving on its own. */
export function shouldLeaveSignIn(input: SignedInRedirectInput): boolean {
  if (!input.hasSession) return false;
  if (input.recovering) return false;
  if (input.bounced) return false;
  if (mustStayOnSignIn(input.location)) return false;
  return true;
}
