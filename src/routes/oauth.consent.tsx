import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { isValidAuthorizationId, rememberPendingAuthorization } from "@/lib/mcp/pending-authorization";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

interface ConsentSearch {
  authorization_id: string;
}

export const Route = createFileRoute("/oauth/consent")({
  staticData: { sitemap: false },
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ConsentSearch => ({
    authorization_id: typeof search["authorization_id"] === "string" ? (search["authorization_id"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: metaText("assistant", "consent.meta.title") },
      { name: "description", content: metaText("assistant", "consent.meta.description") },
      { property: "og:title", content: metaText("assistant", "consent.meta.title") },
      { property: "og:description", content: metaText("assistant", "consent.meta.description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsentPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="panel w-full max-w-md p-8">{children}</div>
    </div>
  );
}

function ConsentPage() {
  const { t } = useT("assistant");
  const navigate = useNavigate();
  const { authorization_id: authorizationId } = Route.useSearch();
  const { session, loading: sessionLoading } = useSession();
  const [decision, setDecision] = useState<"approve" | "deny" | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const valid = isValidAuthorizationId(authorizationId);
  const signedIn = Boolean(session);

  useEffect(() => {
    if (!valid || sessionLoading || signedIn) return;
    rememberPendingAuthorization(authorizationId);
    void navigate({ to: "/auth" });
  }, [valid, sessionLoading, signedIn, authorizationId, navigate]);

  const details = useQuery({
    queryKey: ["oauth-authorization", authorizationId],
    enabled: valid && signedIn,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (error) throw new Error(error.message);
      return data;
    },
  });

  // Already approved previously: Supabase hands back a ready redirect URL.
  useEffect(() => {
    const data = details.data;
    if (data && !("authorization_id" in data) && data.redirect_url) {
      window.location.replace(data.redirect_url);
    }
  }, [details.data]);

  async function decide(kind: "approve" | "deny") {
    setDecision(kind);
    setDecisionError(null);
    const { data, error } =
      kind === "approve"
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, {
            skipBrowserRedirect: true,
          });
    if (error || !data?.redirect_url) {
      setDecision(null);
      setDecisionError(error?.message ?? t("consent.errorTitle"));
      return;
    }
    // Only ever navigate to the URL the authorization server returned.
    window.location.replace(data.redirect_url);
  }

  if (!valid) {
    return (
      <Shell>
        <h1 className="font-display text-xl font-semibold">{t("consent.invalidTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("consent.invalidDescription")}</p>
        <Button className="mt-6" variant="outline" onClick={() => void navigate({ to: "/" })}>
          {t("consent.backHome")}
        </Button>
      </Shell>
    );
  }

  if (sessionLoading || !signedIn || details.isLoading) {
    return (
      <Shell>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
        <Skeleton className="mt-6 h-24 w-full rounded-lg" />
        <div className="mt-6 flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-24" />
        </div>
      </Shell>
    );
  }

  if (details.isError) {
    return (
      <Shell>
        <h1 className="font-display text-xl font-semibold">{t("consent.errorTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("consent.errorDescription")}</p>
        <div className="mt-6 flex gap-2">
          <Button onClick={() => void details.refetch()}>{t("consent.retry")}</Button>
          <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
            {t("consent.backHome")}
          </Button>
        </div>
      </Shell>
    );
  }

  const data = details.data;
  if (!data || !("authorization_id" in data)) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("consent.redirecting")}
        </div>
      </Shell>
    );
  }

  const clientName = data.client?.name || data.client?.id || t("consent.unknownApp");
  const clientUri = data.client?.uri;
  const scopes = (data.scope ?? "").split(/\s+/).filter(Boolean);

  return (
    <Shell>
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="font-display text-xl font-semibold">{t("consent.title")}</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("consent.description", { app: clientName })}
      </p>

      <dl className="mt-6 space-y-3 rounded-lg border border-border p-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("consent.clientLabel")}
          </dt>
          <dd className="mt-1 font-medium">{clientName}</dd>
        </div>
        {clientUri ? (
          <div>
            <dt className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("consent.websiteLabel")}
            </dt>
            <dd className="mt-1 break-all">{clientUri}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("consent.accountLabel")}
          </dt>
          <dd className="mt-1 break-all">{data.user?.email}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("consent.scopesLabel")}
          </dt>
          <dd className="mt-1">
            {scopes.length ? (
              <ul className="list-inside list-disc space-y-1">
                {scopes.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
            ) : (
              t("consent.scopesNone")
            )}
          </dd>
        </div>
      </dl>

      {decisionError ? <p className="mt-4 text-sm text-destructive">{decisionError}</p> : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void decide("approve")} disabled={decision !== null}>
          {decision === "approve" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {t("consent.approve")}
        </Button>
        <Button
          variant="outline"
          onClick={() => void decide("deny")}
          disabled={decision !== null}
        >
          {t("consent.deny")}
        </Button>
      </div>
    </Shell>
  );
}
