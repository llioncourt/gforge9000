import { useEffect, useState } from "react";
import { Dices, Loader2, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/hooks";
import type { ProtectedAccessUnavailableReason } from "@/lib/auth-guard";

function BrandMark() {
  return (
    <div className="grid h-12 w-12 place-content-center rounded-lg bg-primary text-primary-foreground shadow-lg">
      <Dices className="h-6 w-6" />
    </div>
  );
}

/** After this long on the boot screen, a way out is offered. */
const SLOW_BOOT_MS = 8_000;

/**
 * Shown while the protected area checks the session and loads its first
 * screen, in place of an empty page. Deliberately free of data access.
 */
export function AppBootScreen() {
  const { t } = useT("errors");
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_BOOT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <BrandMark />
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t("session.loading")}</span>
      {slow ? (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{t("session.slow")}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("boundary.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Shown in the content area while the next screen's code arrives. The menu
 * and top bar stay in place; before this, the whole page went empty during
 * that wait.
 */
export function AppContentLoading() {
  const { t } = useT("errors");
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-live="polite"
      data-content-loading=""
    >
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t("session.loading")}</span>
    </div>
  );
}

/**
 * Shown when the session could not be checked. Offers a retry (a plain reload
 * keeps the stored session) and, as a last resort, the sign-in page.
 */
export function SessionUnavailableScreen({ reason }: { reason: ProtectedAccessUnavailableReason }) {
  const { t } = useT("errors");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="grid h-12 w-12 place-content-center rounded-lg border border-border bg-card text-muted-foreground">
          <WifiOff className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("session.unavailableTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {reason === "network" ? t("session.unavailableNetwork") : t("session.unavailableTimeout")}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button type="button" className="gap-1.5" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            {t("boundary.retry")}
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href="/auth">{t("session.signInAgain")}</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
