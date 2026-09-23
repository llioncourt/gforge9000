import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/hooks";
import {
  APP_BUILD_ID,
  isUpdateAvailable,
  readLoadedAppAssetId,
  refreshToLatestVersion,
} from "@/lib/app-version";

/** Periodic background probe cadence. Focus/visibility re-checks are throttled below. */
const CHECK_INTERVAL_MS = 10 * 60_000;
/** Minimum time between two focus/visibilitychange-triggered checks. */
const RECHECK_THROTTLE_MS = 60_000;

export function AppUpdateNotice() {
  const { t } = useT("navigation");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const lastCheckRef = useRef(0);

  const checkForUpdate = useCallback(async (signal?: AbortSignal) => {
    const loadedAssetId = readLoadedAppAssetId();
    const available = await isUpdateAvailable(APP_BUILD_ID, loadedAssetId, signal);
    if (available) setUpdateAvailable(true);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const controller = new AbortController();

    const runCheck = () => {
      lastCheckRef.current = Date.now();
      void checkForUpdate(controller.signal);
    };

    // Focus and visibilitychange can both fire for the same tab switch;
    // throttle so they never trigger two checks back to back.
    const onRecheckTrigger = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheckRef.current < RECHECK_THROTTLE_MS) return;
      runCheck();
    };

    runCheck();
    const interval = window.setInterval(runCheck, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onRecheckTrigger);
    window.addEventListener("focus", onRecheckTrigger);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onRecheckTrigger);
      window.removeEventListener("focus", onRecheckTrigger);
    };
  }, [checkForUpdate]);

  if (!updateAvailable) return null;

  return (
    <div
      className="no-print flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-primary/35 bg-primary px-3 py-2 text-primary-foreground sm:px-4"
      role="status"
      aria-live="polite"
    >
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="text-center text-sm font-medium">{t("update.message")}</p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 gap-1.5"
        onClick={() => refreshToLatestVersion()}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {t("update.action")}
      </Button>
    </div>
  );
}
