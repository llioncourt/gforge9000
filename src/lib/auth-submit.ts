/**
 * Bounded execution for sign-in / sign-up requests.
 *
 * Guarantees for the caller UI:
 * - a thrown error never leaves the form stuck in its busy state;
 * - a hung request resolves as `timeout` after a finite deadline;
 * - a late completion after timeout or unmount is ignored by the caller
 *   (`stale`), so it can never trigger a surprise navigation.
 *
 * Never logs or returns credentials.
 */

export const AUTH_REQUEST_TIMEOUT_MS = 20_000;

export type AuthRequestResult<T> =
  { status: "ok"; data: T } | { status: "timeout" } | { status: "thrown"; message: string | null };

export interface RunAuthRequestOptions {
  timeoutMs?: number;
  setTimeoutFn?: (run: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

export async function runAuthRequest<T>(
  request: () => Promise<T>,
  options: RunAuthRequestOptions = {},
): Promise<AuthRequestResult<T>> {
  const timeoutMs = options.timeoutMs ?? AUTH_REQUEST_TIMEOUT_MS;
  const setTimeoutFn =
    options.setTimeoutFn ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimeoutFn =
    options.clearTimeoutFn ?? ((handle: unknown) => clearTimeout(handle as never));

  let handle: unknown = null;
  const timeout = new Promise<AuthRequestResult<T>>((resolve) => {
    handle = setTimeoutFn(() => resolve({ status: "timeout" }), timeoutMs);
  });

  const call = (async (): Promise<AuthRequestResult<T>> => {
    try {
      return { status: "ok", data: await request() };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : null;
      return { status: "thrown", message };
    }
  })();

  // The underlying promise is always observed, so a late rejection can never
  // become an unhandled rejection.
  void call.catch(() => undefined);

  const result = await Promise.race([call, timeout]);
  if (handle !== null) clearTimeoutFn(handle);
  return result;
}
