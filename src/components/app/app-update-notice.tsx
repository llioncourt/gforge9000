import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  APP_BUILD_ID,
  fetchDeployedAppAssetId,
  fetchDeployedBuildId,
  isNewAppAssetAvailable,
  isNewBuildAvailable,
  readLoadedAppAssetId,
  refreshToLatestVersion,
} from "@/lib/app-version";

const CHECK_INTERVAL_MS = 60_000;

export function AppUpdateNotice() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkForUpdate = useCallback(async (signal?: AbortSignal) => {
    const loadedAssetId = readLoadedAppAssetId();
    const [buildResult, assetResult] = await Promise.allSettled([
      fetchDeployedBuildId(signal),
      fetchDeployedAppAssetId(signal),
    ]);
    const deployedBuildId = buildResult.status === "fulfilled" ? buildResult.value : null;
    const deployedAssetId = assetResult.status === "fulfilled" ? assetResult.value : null;

    if (
      isNewBuildAvailable(APP_BUILD_ID, deployedBuildId) ||
      isNewAppAssetAvailable(loadedAssetId, deployedAssetId)
    ) {
      setUpdateAvailable(true);
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const controller = new AbortController();
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkForUpdate(controller.signal);
    };

    void checkForUpdate(controller.signal);
    const interval = window.setInterval(onVisible, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
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
      <p className="text-center text-sm font-medium">A new version is ready.</p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 gap-1.5"
        onClick={() => refreshToLatestVersion()}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh now
      </Button>
    </div>
  );
}