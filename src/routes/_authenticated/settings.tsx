import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { wipeAllMyData } from "@/lib/api";
import { lovable } from "@/integrations/lovable/index";
import { useSession } from "@/hooks/use-session";
import { AUDIT_SUMMARY, RULES_AUDIT } from "@/rules/audit";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";
import { LanguageSelector } from "@/components/app/language-selector";

const WIPE_INTENT_KEY = "ucf:wipe-intent";
const WIPE_INTENT_TTL = 5 * 60 * 1000;

export const Route = createFileRoute("/_authenticated/settings")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: metaText("settings", "meta.title") },
      { name: "description", content: metaText("settings", "meta.description") },
      { property: "og:title", content: metaText("settings", "meta.title") },
      { property: "og:description", content: metaText("settings", "meta.description") },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useT("settings");
  const { t: tRules } = useT("rules");
  const { t: tc } = useT("common");
  // Rule ids come from data, so their audit labels are resolved dynamically.
  const tRuleKey = tRules as (key: string) => string;
  const { user } = useSession();
  const queryClient = useQueryClient();

  const [wipeOpen, setWipeOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // A full-page Google redirect returns here: restore the pending intent.
  useEffect(() => {
    const raw = sessionStorage.getItem(WIPE_INTENT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(WIPE_INTENT_KEY);
    if (Date.now() - Number(raw) > WIPE_INTENT_TTL) return;
    setVerified(true);
    setWipeOpen(true);
  }, []);

  async function confirmWithGoogle() {
    setVerifying(true);
    sessionStorage.setItem(WIPE_INTENT_KEY, String(Date.now()));
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/settings`,
      });
      if ("redirected" in result && result.redirected) return;
      if (result.error) throw result.error;
      sessionStorage.removeItem(WIPE_INTENT_KEY);
      setVerified(true);
      toast.success(t("toasts.identityConfirmed"));
    } catch (e) {
      sessionStorage.removeItem(WIPE_INTENT_KEY);
      toast.error(e instanceof Error ? e.message : t("toasts.identityFailed"));
    } finally {
      setVerifying(false);
    }
  }

  const wipe = useMutation({
    mutationFn: wipeAllMyData,
    onSuccess: () => {
      queryClient.clear();
      setWipeOpen(false);
      setVerified(false);
      toast.success(t("toasts.wiped"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl">
      <PageHeader title={t("page.title")} description={t("page.description")} />

      <div className="space-y-6">
        <section className="panel space-y-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">{t("language.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("language.description")}</p>
            </div>
            <LanguageSelector />
          </div>
        </section>

        <section className="panel space-y-4 p-6">
          <div>
            <h2 className="font-display text-lg font-semibold">{t("rulesStatus.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("rulesStatus.summary", {
                exact: AUDIT_SUMMARY.EXACT,
                configurable: AUDIT_SUMMARY.CONFIGURABLE,
                approximation: AUDIT_SUMMARY.APPROXIMATION,
                missing: AUDIT_SUMMARY.MISSING,
              })}
            </p>
          </div>
          <ul className="divide-y divide-border text-sm">
            {RULES_AUDIT.map((rule) => (
              <li key={rule.id} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{tRuleKey(`audit.${rule.id}.title`)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${
                      rule.status === "EXACT"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : rule.status === "CONFIGURABLE"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {tRules(`status.${rule.status}`)}
                  </span>
                </div>
                <p className="text-muted-foreground">{tRuleKey(`audit.${rule.id}.notes`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel space-y-4 border-destructive/40 p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h2 className="font-display text-lg font-semibold text-destructive">{t("danger.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("danger.description")}</p>
            </div>
          </div>
          <Button
            variant="destructive"
            onClick={() => {
              setVerified(false);
              setWipeOpen(true);
            }}
          >
            {t("danger.eraseButton")}
          </Button>
        </section>
      </div>

      <AlertDialog
        open={wipeOpen}
        onOpenChange={(open) => {
          setWipeOpen(open);
          if (!open) setVerified(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("wipeDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("wipeDialog.description", { email: user?.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={wipe.isPending}>{tc("actions.cancel")}</AlertDialogCancel>
            {verified ? (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  wipe.mutate();
                }}
                disabled={wipe.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {wipe.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {t("wipeDialog.deleteEverything")}
              </AlertDialogAction>
            ) : (
              <Button onClick={confirmWithGoogle} disabled={verifying}>
                {verifying ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {t("wipeDialog.confirmWithGoogle")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
