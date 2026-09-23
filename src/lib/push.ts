/** Browser-side Web Push subscription helpers. */
import { PWA_ENABLED } from "@/lib/pwa";
import {
  getPushPublicKey,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push.functions";

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function encodeKey(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * True when background push can work here (installed app / real deployment
 * AND the service worker is allowed for this release). While `PWA_ENABLED`
 * is false, this is always false — callers must fail fast instead of
 * awaiting `navigator.serviceWorker.ready`, which never resolves without a
 * registered worker.
 */
export function isPushSupported(): boolean {
  return (
    PWA_ENABLED &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.top === window.self
  );
}

/**
 * Registers this device for background alerts. Requires notification
 * permission to be granted already. Returns false immediately (without
 * touching `navigator.serviceWorker.ready`) when unsupported or when
 * background push is disabled for this release.
 */
export async function enableBackgroundPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return false;

  const { publicKey } = await getPushPublicKey();
  if (!publicKey) return false;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await savePushSubscription({
    data: {
      endpoint: subscription.endpoint,
      p256dh: encodeKey(subscription.getKey("p256dh")),
      auth: encodeKey(subscription.getKey("auth")),
      userAgent: navigator.userAgent,
    },
  });
  return true;
}

export async function disableBackgroundPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await removePushSubscription({ data: { endpoint: subscription.endpoint } });
  await subscription.unsubscribe().catch(() => undefined);
}
