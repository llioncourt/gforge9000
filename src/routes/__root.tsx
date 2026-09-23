import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppRuntime } from "@/components/app/app-runtime";
import { I18nProvider } from "@/i18n/provider";
import { detectLocale } from "@/i18n/detect";
import { localeDirection } from "@/i18n/config";
import { useT } from "@/i18n/hooks";
import { isAuthShellPath } from "@/lib/app-runtime";
import { resolveDiagFlags, diagTrace } from "@/lib/diag-modes";

function NotFoundComponent() {
  const { t } = useT("errors");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">{t("notFound.code")}</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("notFound.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFound.description")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("notFound.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  // The root error boundary can render outside the app providers, so it brings
  // its own i18n instance.
  return (
    <I18nProvider initialLocale={detectLocale()}>
      <ErrorScreen
        error={error}
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
    </I18nProvider>
  );
}

function ErrorScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useT("errors");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("boundary.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={onRetry}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("boundary.retry")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("boundary.goHome")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Universal Character Forge — GURPS 4e Character Builder" },
      {
        name: "description",
        content:
          "Build GURPS 4e characters, run campaigns, and roll dice with a data-driven rules engine. Unofficial companion to GURPS Fourth Edition.",
      },
      { property: "og:title", content: "Universal Character Forge — GURPS 4e Character Builder" },
      {
        property: "og:description",
        content:
          "Build GURPS 4e characters, run campaigns, and roll dice with a data-driven rules engine. Unofficial companion to GURPS Fourth Edition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#1a1a1a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Char Forge" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      {
        name: "google-site-verification",
        content: "5blhJzh3sEeR7VKnUMKyQZjtKQ-5tu89z5kqwmjr8FM",
      },
    ],

    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Sora:wght@500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const locale = detectLocale();
  return (
    <html lang={locale} dir={localeDirection(locale)} className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const searchStr = location.searchStr ?? "";

  // Temporary `/auth` freeze diagnostics — see `@/lib/diag-modes`.
  const diag = resolveDiagFlags(pathname, searchStr);

  // The public sign-in route boots a minimal shell: no global auth listener,
  // no service-worker retirement, no dice runtime. Application routes mount
  // the full runtime again, and route protection is unchanged.
  const authShell = isAuthShellPath(pathname);

  useEffect(() => {
    diagTrace(diag.trace, "root mounted");
  }, [diag.trace]);

  const content = (
    <>
      <Outlet />
      <Toaster position="top-right" richColors />
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider initialLocale={detectLocale()}>
        <TooltipProvider delayDuration={200}>
          {authShell ? (
            content
          ) : (
            <AppRuntime
              queryClient={queryClient}
              skipAuthListener={diag.skipRootAuthListener}
              skipPwaCleanup={diag.skipPwaCleanup}
              trace={diag.trace}
            >
              {content}
            </AppRuntime>
          )}
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
