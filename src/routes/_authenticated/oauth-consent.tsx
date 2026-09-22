import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { approveOAuthConsent, getOAuthConsentInfo } from "@/lib/mcp/oauth.functions";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

const consentSearchSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/oauth-consent")({
  staticData: { sitemap: false },
  validateSearch: (search) => consentSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: metaText("settings", "assistant.consentMetaTitle") },
      { name: "description", content: metaText("settings", "assistant.consentMetaDescription") },
      { property: "og:title", content: metaText("settings", "assistant.consentMetaTitle") },
      {
        property: "og:description",
        content: metaText("settings", "assistant.consentMetaDescription"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OAuthConsentPage,
});

function OAuthConsentPage() {
  const { t } = useT("settings");
  const search = Route.useSearch();
  const getInfo = useServerFn(getOAuthConsentInfo);
  const approveFn = useServerFn(approveOAuthConsent);
  const [failed, setFailed] = useState(false);

  const info = useQuery({
    queryKey: ["oauth-consent", search.client_id],
    queryFn: () => getInfo({ data: { client_id: search.client_id } }),
    retry: false,
  });

  const approve = useMutation({
    mutationFn: () =>
      approveFn({
        data: {
          client_id: search.client_id,
          redirect_uri: search.redirect_uri,
          code_challenge: search.code_challenge,
          ...(search.state ? { state: search.state } : {}),
        },
      }),
    onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
    onError: () => setFailed(true),
  });

  function deny() {
    const target = new URL(search.redirect_uri);
    target.searchParams.set("error", "access_denied");
    if (search.state) target.searchParams.set("state", search.state);
    window.location.assign(target.toString());
  }

  const clientName = info.data?.clientName ?? null;

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <div className="space-y-4 rounded-xl border p-6 text-center">
        <ShieldCheck className="text-primary mx-auto size-10" />
        {info.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="mx-auto h-7 w-48 rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <div className="flex justify-center gap-3">
              <Skeleton className="h-10 w-24 rounded-lg" />
              <Skeleton className="h-10 w-24 rounded-lg" />
            </div>
          </div>
        ) : info.isError || failed ? (
          <p className="text-muted-foreground text-sm">{t("assistant.consentInvalid")}</p>
        ) : (
          <>
            <h1 className="text-xl font-semibold">
              {t("assistant.consentTitle", {
                client: clientName ?? t("assistant.consentUnknownClient"),
              })}
            </h1>
            <p className="text-muted-foreground text-sm">{t("assistant.consentDescription")}</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={deny} disabled={approve.isPending}>
                {t("assistant.consentDeny")}
              </Button>
              <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                {t("assistant.consentAllow")}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t("assistant.consentNote")}</p>
          </>
        )}
      </div>
    </div>
  );
}
