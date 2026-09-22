import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { MCP_ENDPOINT_PATH, mcpEndpointUrl } from "@/lib/mcp/config";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

export const Route = createFileRoute("/_authenticated/assistant")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: metaText("assistant", "meta.title") },
      { name: "description", content: metaText("assistant", "meta.description") },
      { property: "og:title", content: metaText("assistant", "meta.title") },
      { property: "og:description", content: metaText("assistant", "meta.ogDescription") },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const { t } = useT("assistant");
  const [endpoint, setEndpoint] = useState(MCP_ENDPOINT_PATH);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEndpoint(mcpEndpointUrl(window.location.origin));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("page.title")} description={t("page.description")} />

      <div className="panel max-w-2xl p-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {t("endpoint.label")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            {endpoint}
          </code>
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? t("endpoint.copied") : t("endpoint.copy")}
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{t("endpoint.help")}</p>
      </div>

      <div className="panel mt-4 max-w-2xl p-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {t("access.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("access.description")}</p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-muted-foreground">
          <li>{t("access.pointOne")}</li>
          <li>{t("access.pointTwo")}</li>
          <li>{t("access.pointThree")}</li>
        </ul>
      </div>
    </div>
  );
}
