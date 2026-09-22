import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Calculator, Dices, Layers, ScrollText, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useParallax } from "@/hooks/use-parallax";
import { AmbientBackground } from "@/components/app/ambient-background";
import { useT } from "@/i18n/hooks";
import { metaLocale, metaText } from "@/i18n/meta";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: metaText("marketing", "meta.home.title") },
      { name: "description", content: metaText("marketing", "meta.home.description") },
      { property: "og:title", content: metaText("marketing", "meta.home.title") },
      { property: "og:description", content: metaText("marketing", "meta.home.description") },
      { property: "og:locale", content: metaLocale() },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Universal Character Forge",
          applicationCategory: "GameApplication",
          operatingSystem: "Web",
          url: "https://gforge9000.lovable.app/",
          description:
            "A modern forge for universal characters: build GURPS 4e characters, run campaigns, and roll dice with a data-driven rules engine. Unofficial companion to GURPS Fourth Edition.",
        }),
      },
    ],
  }),

  component: Landing,
});

const FEATURE_KEYS = [
  { icon: Calculator, key: "pointEngine" },
  { icon: Layers, key: "dataDriven" },
  { icon: Dices, key: "rollableSheet" },
  { icon: Users, key: "campaigns" },
  { icon: ScrollText, key: "portable" },
  { icon: Shield, key: "yourContent" },
] as const;

function Landing() {
  const { t } = useT("marketing");
  const { status } = useAuth();
  const navigate = useNavigate();
  const moved = useRef(false);

  // The sign-in provider always returns to this page. A signed-in visitor is
  // sent on exactly once: to the destination recorded before sign-in started,
  // or to the dashboard.
  useEffect(() => {
    if (status !== "signed-in" || moved.current) return;
    moved.current = true;
    navigate({ to: consumeDestination() ?? DEFAULT_DESTINATION, replace: true });
  }, [status, navigate]);

  const heroRef = useParallax<HTMLElement>();

  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <header className="glass-bar sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-content-center rounded-md bg-primary text-primary-foreground">
            <Dices className="h-4 w-4" />
          </div>
          <span className="truncate font-display text-sm font-semibold">
            <span className="sm:hidden">{t("brand.short")}</span>
            <span className="hidden sm:inline">{t("brand.full")}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/legal" className="text-sm text-muted-foreground hover:text-foreground">
            {t("nav.legal")}
          </Link>
          <Button asChild size="sm">
            <Link to="/auth">{t("nav.signIn")}</Link>
          </Button>
        </div>
      </header>

      <section ref={heroRef} className="relative z-10 overflow-hidden border-y border-border/60">
        <div
          className="parallax-layer pointer-events-none absolute inset-x-0 -top-24 h-[140%] grid-noise opacity-70"
          style={{ "--speed": 0.12 } as React.CSSProperties}
          aria-hidden="true"
        />
        <div
          className="parallax-layer relative mx-auto max-w-5xl px-5 py-20 text-center sm:px-6 sm:py-28"
          style={{ "--speed": -0.06 } as React.CSSProperties}
        >
          <p className="mb-4 inline-flex items-center rounded-full border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
            {t("hero.eyebrow")}
          </p>
          <h1 className="rise-in font-display text-3xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            {t("hero.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t("hero.body")}
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link to="/auth">{t("hero.startBuilding")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/legal">{t("hero.contentPolicy")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map(({ icon: Icon, key }) => (
            <div key={key} className="glass hover-lift p-6">
              <Icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-display text-lg font-semibold">
                {t(`features.${key}.title`)}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`features.${key}.body`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border px-6 py-10 text-center text-xs leading-relaxed text-muted-foreground">
        {t("footer.disclaimer")}{" "}
        <Link to="/legal" className="underline hover:text-foreground">
          {t("footer.fullPolicy")}
        </Link>
        .
      </footer>
    </div>
  );
}
