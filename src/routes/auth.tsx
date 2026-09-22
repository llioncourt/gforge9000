import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dices, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/i18n/hooks";
import { metaLocale, metaText } from "@/i18n/meta";
import { Trans } from "react-i18next";

// Only same-origin paths are allowed as post-login redirect targets.
function safeRedirectTarget(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: metaText("auth", "meta.title") },
      { name: "description", content: metaText("auth", "meta.description") },
      { property: "og:title", content: metaText("auth", "meta.title") },
      { property: "og:description", content: metaText("auth", "meta.ogDescription") },
      { property: "og:locale", content: metaLocale() },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useT("auth");
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const { redirect: redirectParam } = Route.useSearch();
  const target = safeRedirectTarget(redirectParam);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: target, replace: true });
  }, [loading, user, navigate, target]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: target, replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName || email.split("@")[0] },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setSent(true);
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(t("errors.googleSignInFailed"));
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="grid-noise hidden flex-col justify-between border-r border-border p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-content-center rounded-md bg-primary text-primary-foreground">
            <Dices className="h-4 w-4" />
          </div>
          <span className="font-display text-sm font-semibold">{t("brand.name")}</span>
        </Link>
        <div>
          <h2 className="font-display text-3xl font-semibold leading-tight">{t("hero.title")}</h2>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{t("hero.body")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{t("hero.disclaimer")}</p>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {sent ? (
            <div className="panel p-6 text-center">
              <h1 className="font-display text-xl font-semibold">{t("confirmEmail.title")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("confirmEmail.body", { email })}
              </p>
              <Button className="mt-6 w-full" variant="outline" onClick={() => setSent(false)}>
                {t("confirmEmail.back")}
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="signin">
              <h1 className="mb-6 font-display text-2xl font-semibold">{t("form.title")}</h1>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">{t("form.tabs.signin")}</TabsTrigger>
                <TabsTrigger value="signup">{t("form.tabs.signup")}</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={signIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t("form.fields.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">{t("form.fields.password")}</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={busy}
                    aria-label={t("form.actions.signIn")}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("form.actions.signIn")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={signUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("form.fields.displayName")}</Label>
                    <Input
                      id="name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t("form.fields.displayNamePlaceholder")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email-up">{t("form.fields.email")}</Label>
                    <Input
                      id="email-up"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password-up">{t("form.fields.password")}</Label>
                    <Input
                      id="password-up"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={busy}
                    aria-label={t("form.actions.createAccount")}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t("form.actions.createAccount")
                    )}
                  </Button>
                </form>
              </TabsContent>

              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> {t("form.or")}{" "}
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="w-full" onClick={google}>
                {t("form.actions.continueWithGoogle")}
              </Button>

              <p className="mt-6 text-center text-xs text-muted-foreground">
                <Trans
                  t={t}
                  i18nKey="form.policy.text"
                  components={{
                    1: <Link to="/legal" className="underline hover:text-foreground" />,
                  }}
                />
              </p>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
