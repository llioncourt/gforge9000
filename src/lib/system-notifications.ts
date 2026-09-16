/** Browser (system) notifications for GM reveals. Pure helpers, no React. */

export type NotificationPermissionState =
  | "unsupported"
  | "open-in-new-tab"
  | "default"
  | "granted"
  | "denied";

export function readNotificationPermission(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (window.top !== window.self) return "open-in-new-tab";
  const permission = Notification.permission;
  if (permission === "granted") return "granted";
  if (permission === "denied") return "denied";
  return "default";
}

/** Must be called from a user gesture; browsers ignore it otherwise. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const current = readNotificationPermission();
  if (current !== "default") return current;
  const result = await Notification.requestPermission();
  return result === "granted" ? "granted" : result === "denied" ? "denied" : "default";
}

export function showSystemNotification(options: {
  title: string;
  body?: string | null | undefined;
  tag?: string | undefined;
  url?: string | undefined;
}): void {
  if (readNotificationPermission() !== "granted") return;
  try {
    const init: NotificationOptions = {
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    };
    if (options.body) init.body = options.body;
    if (options.tag) init.tag = options.tag;
    const notification = new Notification(options.title, init);
    notification.onclick = () => {
      window.focus();
      if (options.url) window.location.assign(options.url);
      notification.close();
    };
  } catch {
    /* notification construction can throw on some mobile browsers; ignore */
  }
}
