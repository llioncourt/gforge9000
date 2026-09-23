/**
 * Shared, framework-free runtime rules for the application shell.
 *
 * Two concerns live here so they can be unit-tested without a browser:
 *
 * 1. `isAuthShellPath` — which routes render the MINIMAL auth shell (no global
 *    auth listener, no service-worker/cache retirement, no dice runtime).
 * 2. `createAuthInvalidationHandler` — a synchronous auth-state callback that
 *    defers router/query invalidation to a macrotask, so no app work runs
 *    inside the auth client's notification lock.
 */

/** Routes that must boot with the minimal shell (public sign-in surface). */
export function isAuthShellPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, "");
  return clean === "/auth";
}

export type AuthRuntimeEvent = string;

export interface AuthInvalidationDeps {
  /** Re-run route loaders. */
  invalidateRouter: () => void | Promise<unknown>;
  /** Drop cached query data (skipped on sign-out). */
  invalidateQueries: () => void | Promise<unknown>;
  /** Macrotask scheduler; returns a handle understood by `cancel`. */
  schedule: (run: () => void) => unknown;
  /** Cancels a handle returned by `schedule`. */
  cancel: (handle: unknown) => void;
  /** Optional trace sink; never receives tokens or user data. */
  trace?: ((event: string) => void) | undefined;
}

export interface AuthInvalidationHandler {
  /** Synchronous — safe to pass straight to `onAuthStateChange`. */
  handle: (event: AuthRuntimeEvent, sessionKey: string | null) => void;
  /** Cancels any scheduled work (call on unmount). */
  dispose: () => void;
}

const HANDLED_EVENTS = new Set(["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"]);

export function createAuthInvalidationHandler(
  deps: AuthInvalidationDeps,
): AuthInvalidationHandler {
  let pending: unknown = null;
  let disposed = false;
  let lastSignedInKey: string | null = null;

  function run(event: AuthRuntimeEvent) {
    pending = null;
    if (disposed) return;
    deps.trace?.("invalidate start");
    try {
      void Promise.resolve(deps.invalidateRouter()).catch(() => undefined);
      if (event !== "SIGNED_OUT") {
        void Promise.resolve(deps.invalidateQueries()).catch(() => undefined);
      }
    } catch {
      // Invalidation must never surface as an unhandled rejection.
    }
    deps.trace?.("invalidate end");
  }

  return {
    handle(event, sessionKey) {
      if (disposed) return;
      deps.trace?.(`auth event: ${event}`);
      if (!HANDLED_EVENTS.has(event)) return;

      if (event === "SIGNED_IN") {
        // Repeated SIGNED_IN for the same session (tab focus, token refresh
        // notifications) must not re-invalidate the whole app.
        if (sessionKey !== null && sessionKey === lastSignedInKey) return;
        lastSignedInKey = sessionKey;
      } else if (event === "SIGNED_OUT") {
        lastSignedInKey = null;
      } else if (sessionKey !== null) {
        lastSignedInKey = sessionKey;
      }

      if (pending !== null) deps.cancel(pending);
      pending = deps.schedule(() => run(event));
    },
    dispose() {
      disposed = true;
      if (pending !== null) {
        deps.cancel(pending);
        pending = null;
      }
    },
  };
}
