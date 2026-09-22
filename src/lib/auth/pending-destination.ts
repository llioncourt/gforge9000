/**
 * Application-level continuation for sign-in.
 *
 * The provider redirect never carries an application destination: the browser
 * always comes back to the site origin. Where the user wanted to go is kept
 * here, in the tab's own storage, and consumed exactly once after the session
 * exists. Targets are validated against an explicit internal allowlist, so a
 * crafted value can never send the user off-site.
 */

const KEY = "ucf.auth.pending-destination";
const TTL_MS = 10 * 60 * 1000;

/** Internal route prefixes that may be used as a post sign-in destination. */
const ALLOWED_PREFIXES = [
  "/dashboard",
  "/characters",
  "/campaigns",
  "/library",
  "/packs",
  "/entities",
  "/assistant",
  "/oauth-consent",
] as const;

export const DEFAULT_DESTINATION = "/dashboard";

/** Returns the target when it is a safe internal path, otherwise the default. */
export function safeDestination(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_DESTINATION;
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_DESTINATION;
  const path = value.split("?")[0] ?? "";
  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  return allowed ? value : DEFAULT_DESTINATION;
}

export function rememberDestination(value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ to: safeDestination(value), at: Date.now() }),
    );
  } catch {
    /* storage unavailable: fall back to the default destination */
  }
}

/** Reads and clears the pending destination. Returns null when there is none. */
export function consumeDestination(): string | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { to?: unknown; at?: unknown };
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > TTL_MS) return null;
    return safeDestination(parsed.to);
  } catch {
    return null;
  }
}

export function clearDestination(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
