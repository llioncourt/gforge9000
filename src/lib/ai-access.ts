/** Only this account may run features that spend AI credits. */
export const AI_OWNER_EMAIL = "akubrusly@gmail.com";

export function canUseAi(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === AI_OWNER_EMAIL;
}

/** Server-side guard; throws a neutral error for anyone else. */
export function assertAiAccess(claims: { email?: unknown } | null | undefined): void {
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (!canUseAi(email)) throw new Error("This action is not available.");
}
