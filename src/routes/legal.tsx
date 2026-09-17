import { createFileRoute, Link } from "@tanstack/react-router";
import { useT } from "@/i18n/hooks";
import { metaLocale, metaText } from "@/i18n/meta";

export const Route = createFileRoute("/legal")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: metaText("marketing", "meta.legal.title") },
      { name: "description", content: metaText("marketing", "meta.legal.description") },
      { property: "og:title", content: metaText("marketing", "meta.legal.title") },
      { property: "og:description", content: metaText("marketing", "meta.legal.ogDescription") },
      { property: "og:locale", content: metaLocale() },
    ],
  }),
  component: LegalPage,
});

function LegalPage() {
  const { t } = useT("marketing");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          {t("legal.back")}
        </Link>
        <h1 className="mt-6 font-display text-3xl font-bold">{t("legal.title")}</h1>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {t("legal.unofficial.title")}
            </h2>
            <p className="mt-2">{t("legal.unofficial.body")}</p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {t("legal.trademarks.title")}
            </h2>
            <p className="mt-2">{t("legal.trademarks.body")}</p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {t("legal.contentPolicy.title")}
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>{t("legal.contentPolicy.items.noRulebook")}</li>
              <li>{t("legal.contentPolicy.items.statLabels")}</li>
              <li>{t("legal.contentPolicy.items.formulas")}</li>
              <li>{t("legal.contentPolicy.items.userResponsibility")}</li>
            </ul>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {t("legal.licensedPacks.title")}
            </h2>
            <p className="mt-2">{t("legal.licensedPacks.body")}</p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {t("legal.importExport.title")}
            </h2>
            <p className="mt-2">{t("legal.importExport.body")}</p>
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {t("legal.yourData.title")}
            </h2>
            <p className="mt-2">{t("legal.yourData.body")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
