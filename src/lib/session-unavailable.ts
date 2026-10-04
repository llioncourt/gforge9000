import type { ProtectedAccessUnavailableReason } from "@/lib/auth-guard";

/**
 * Thrown by the protected area's guard when the session could not be checked
 * (the auth service did not answer in time, or the request failed). It is NOT
 * a "signed out" signal: the stored session is left untouched.
 */
export class SessionUnavailableError extends Error {
  readonly reason: ProtectedAccessUnavailableReason;

  constructor(reason: ProtectedAccessUnavailableReason) {
    super(`Session check unavailable (${reason})`);
    this.name = "SessionUnavailableError";
    this.reason = reason;
  }
}

export function isSessionUnavailableError(error: unknown): error is SessionUnavailableError {
  return (
    error instanceof SessionUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "SessionUnavailableError")
  );
}
