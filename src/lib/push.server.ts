/** Server-only Web Push sending (VAPID + aes128gcm), Worker-compatible. */
import { ApplicationServerKeys, generatePushHTTPRequest } from "webpush-webcrypto";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushPayload = {
  title: string;
  body?: string | undefined;
  url?: string | undefined;
  tag?: string | undefined;
};

export type PushSendResult = { endpoint: string; ok: boolean; gone: boolean; status: number };

/** Sends one notification. `gone` means the device unsubscribed: drop the row. */
export async function sendWebPush(
  target: PushTarget,
  payload: PushPayload,
): Promise<PushSendResult> {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const adminContact = process.env["VAPID_SUBJECT"] ?? "mailto:noreply@example.com";
  if (!publicKey || !privateKey) throw new Error("Push keys are not configured");

  const keys = await ApplicationServerKeys.fromJSON({ publicKey, privateKey });
  const { headers, body, endpoint } = await generatePushHTTPRequest({
    applicationServerKeys: keys,
    payload: JSON.stringify(payload),
    target: { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
    adminContact,
    ttl: 60 * 60 * 24,
    urgency: "high",
  });

  const response = await fetch(endpoint, { method: "POST", headers, body: body as BodyInit });
  return {
    endpoint: target.endpoint,
    ok: response.ok,
    gone: response.status === 404 || response.status === 410,
    status: response.status,
  };
}
