import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, ChevronRight, Circle, Crosshair, Dices, ShieldCheck } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

const SYSTEM_ROWS = ["pointEngine", "rollableSheet", "campaigns"] as const;
const PRINCIPLE_ROWS = ["dataDriven", "portable", "yourContent"] as const;

function Landing() {
  const { t } = useT("marketing");
  const { user, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground selection:bg-primary/30">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col border-x border-border/60">
        <header className="flex h-16 items-center justify-between border-b border-border px-5 sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center border border-primary/60 bg-primary/10 text-primary">
              <Dices aria-hidden="true" className="size-4" />
            </span>
            <span className="truncate font-mono text-[11px] font-bold uppercase text-muted-foreground">
              <span className="sm:hidden">{t("brand.short")}</span>
              <span className="hidden sm:inline">{t("brand.full")}</span>
            </span>
          </div>

          <nav aria-label="Primary" className="flex items-center gap-2 sm:gap-5">
            <Link
              to="/legal"
              className="hidden font-mono text-[11px] font-bold uppercase text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              {t("nav.legal")}
            </Link>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-none border-border bg-transparent px-4 font-mono text-[11px] font-bold uppercase shadow-none"
            >
              <a href="/auth">{t("nav.signIn")}</a>
            </Button>
          </nav>
        </header>

        <section className="grid flex-1 lg:grid-cols-[minmax(0,1.12fr)_minmax(420px,0.88fr)]">
          <div className="relative flex min-h-[650px] flex-col justify-between border-b border-border p-6 sm:p-10 lg:border-r lg:border-b-0 lg:p-14 xl:p-20">
            <div aria-hidden="true" className="absolute left-0 top-24 h-px w-20 bg-primary" />

            <div className="relative max-w-3xl pt-12 lg:pt-16">
              <div className="mb-8 flex items-center gap-3 font-mono text-[10px] font-bold uppercase text-primary">
                <Circle aria-hidden="true" className="size-2 fill-current" />
                {t("hero.eyebrow")}
              </div>

              <h1 className="font-display text-5xl font-bold leading-[0.92] sm:text-7xl lg:text-8xl xl:text-9xl">
                <span className="block">Universal</span>
                <span className="block text-muted-foreground">Character</span>
                <span className="block text-primary">Forge.</span>
              </h1>

              <p className="mt-8 max-w-xl border-l-2 border-primary pl-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t("hero.body")}
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="group h-12 rounded-none px-7 font-mono text-xs font-bold uppercase shadow-none"
                >
                  <a href="/auth">{t("hero.startBuilding")}</a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-none border-border bg-transparent px-7 font-mono text-xs font-bold uppercase shadow-none"
                >
                  <Link to="/legal">
                    {t("hero.contentPolicy")}
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-16 flex items-end justify-between border-t border-border pt-5 font-mono text-[10px] uppercase text-muted-foreground">
              <span>{t("brand.full")}</span>
              <span aria-hidden="true">UCF / 4E</span>
            </div>
          </div>

          <div className="flex min-h-[650px] flex-col bg-card/30">
            <div className="relative flex min-h-72 items-center justify-center overflow-hidden border-b border-border p-8 sm:min-h-80">
              <div aria-hidden="true" className="absolute inset-6 border border-border/70" />
              <div aria-hidden="true" className="absolute left-1/2 top-6 h-[calc(100%-3rem)] w-px bg-border/60" />
              <div aria-hidden="true" className="absolute left-6 top-1/2 h-px w-[calc(100%-3rem)] bg-border/60" />
              <Crosshair aria-hidden="true" className="absolute size-52 text-border/70 sm:size-64" strokeWidth={0.6} />
              <div className="relative grid size-32 rotate-45 place-items-center border border-primary/70 bg-background shadow-glow sm:size-40">
                <div className="grid size-20 place-items-center border border-border bg-card sm:size-24">
                  <ShieldCheck aria-hidden="true" className="size-9 -rotate-45 text-primary" strokeWidth={1.5} />
                </div>
              </div>
              <span className="absolute right-9 top-9 font-mono text-[9px] uppercase text-muted-foreground">
                Rules / Campaigns / Characters
              </span>
            </div>

            <div className="grid flex-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <SystemLedger title="System" rows={SYSTEM_ROWS} t={t} />
              <SystemLedger title="Principles" rows={PRINCIPLE_ROWS} t={t} bordered />
            </div>
          </div>
        </section>

        <footer className="grid gap-4 border-t border-border px-5 py-6 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-[1fr_auto] sm:px-8 lg:px-12">
          <p className="max-w-4xl">{t("footer.disclaimer")}</p>
          <Link to="/legal" className="inline-flex items-center gap-1 self-start font-mono font-bold uppercase text-foreground hover:text-primary">
            {t("footer.fullPolicy")}
            <ChevronRight aria-hidden="true" className="size-3" />
          </Link>
        </footer>
      </div>
    </main>
  );
}

function SystemLedger({
  title,
  rows,
  t,
  bordered = false,
}: {
  title: string;
  rows: readonly (typeof SYSTEM_ROWS[number] | typeof PRINCIPLE_ROWS[number])[];
  t: (key: string) => string;
  bordered?: boolean;
}) {
  return (
    <section className={bordered ? "border-t border-border sm:border-t-0 sm:border-l lg:border-l-0 lg:border-t xl:border-t-0 xl:border-l" : ""}>
      <h2 className="border-b border-border px-6 py-4 font-mono text-[10px] font-bold uppercase text-primary">
        {title}
      </h2>
      <ol>
        {rows.map((key, index) => (
          <li key={key} className="group border-b border-border/70 px-6 py-5 last:border-b-0">
            <div className="flex items-start gap-4">
              <span className="pt-1 font-mono text-[9px] text-muted-foreground">0{index + 1}</span>
              <div>
                <h3 className="font-display text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                  {t(`features.${key}.title`)}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t(`features.${key}.body`)}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}