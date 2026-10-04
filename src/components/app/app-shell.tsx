import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Boxes,
  Dices,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/app/command-palette";
import { DiceTray } from "@/components/app/dice-tray";
import { DiceOverlay } from "@/components/app/dice-overlay";
import { CampaignSoundtrackProvider } from "@/components/campaign/campaign-soundtrack-player";
import { AmbientBackground } from "@/components/app/ambient-background";
import { NotificationBell } from "@/components/app/notification-bell";
import { ProfileMenu } from "@/components/app/profile-menu";
import { AppUpdateNotice } from "@/components/app/app-update-notice";
import { LanguageSelector, useAccountLocale } from "@/components/app/language-selector";
import { useT } from "@/i18n/hooks";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getIsAdmin } from "@/lib/admin.functions";
import { clearSignedUrlCache } from "@/lib/signed-url-cache";

/** Navigation items keep a translation key, never a literal label. */
const NAV = [
  { to: "/dashboard", labelKey: "links.dashboard", icon: LayoutDashboard },
  { to: "/characters", labelKey: "links.characters", icon: Shield },
  { to: "/campaigns", labelKey: "links.campaigns", icon: Users },
  { to: "/library", labelKey: "links.library", icon: BookOpen },
  { to: "/packs", labelKey: "links.packs", icon: Boxes },
  { to: "/assistant", labelKey: "links.assistant", icon: Sparkles },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useT("navigation");
  useAccountLocale();
  const isAdminFn = useServerFn(getIsAdmin);
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => isAdminFn(),
    staleTime: 5 * 60_000,
  });

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("sidebar-collapsed") === "1");
  }, []);

  function toggleCollapsed(value: boolean) {
    setCollapsed(value);
    window.localStorage.setItem("sidebar-collapsed", value ? "1" : "0");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearSignedUrlCache();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <CampaignSoundtrackProvider pathname={pathname}>
      <div className="relative min-h-screen">
        <AmbientBackground />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <DiceTray open={trayOpen} onOpenChange={setTrayOpen} />
        <DiceOverlay />

        <aside
          className={cn(
            "no-print fixed inset-y-0 left-0 z-40 w-[17rem] max-w-[85vw] border-r border-sidebar-border/70 bg-sidebar/80 backdrop-blur-xl transition-transform duration-300 ease-out will-change-transform lg:w-64",
            open ? "translate-x-0" : "-translate-x-full",
            collapsed ? "lg:-translate-x-full" : "lg:translate-x-0",
          )}
        >
          <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
            <div className="grid h-8 w-8 place-content-center rounded-md bg-primary text-primary-foreground">
              <Dices className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold text-sidebar-foreground">
                {t("brand.name")}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("brand.tagline")}
              </p>
            </div>
            <button
              className="ml-auto text-muted-foreground hover:text-foreground lg:hidden"
              onClick={() => setOpen(false)}
              aria-label={t("sidebar.close")}
            >
              <X className="h-4 w-4" />
            </button>
            <button
              className="ml-auto hidden text-muted-foreground hover:text-foreground lg:block"
              onClick={() => toggleCollapsed(true)}
              aria-label={t("sidebar.collapse")}
              title={t("sidebar.collapse")}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1 p-3">
            {NAV.map(({ to, labelKey, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{
                  className:
                    "bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-sidebar-border",
                }}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </Link>
            ))}
            {isAdmin ? (
              <Link
                to="/admin"
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                activeProps={{
                  className:
                    "bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-sidebar-border",
                }}
              >
                <ShieldCheck className="h-4 w-4" />
                {t("links.admin")}
              </Link>
            ) : null}
          </nav>

          <div className="absolute inset-x-0 bottom-0 space-y-2 border-t border-sidebar-border p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => setTrayOpen(true)}
            >
              <Dices className="h-4 w-4" /> {t("header.diceTray")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" /> {t("header.signOut")}
            </Button>
            <Link
              to="/legal"
              className="block px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("links.legal")}
            </Link>
          </div>
        </aside>

        <div
          className={cn(
            "relative z-10 transition-[padding] duration-300",
            collapsed ? "" : "lg:pl-64",
          )}
        >
          <div className="sticky top-0 z-30">
            <AppUpdateNotice />
            <header className="glass-bar no-print flex h-16 items-center gap-2 border-b border-border/70 px-3 sm:gap-3 sm:px-4">
              <button
                className={cn(
                  "-ml-1 grid h-10 w-10 shrink-0 place-content-center rounded-md text-foreground transition-colors hover:bg-secondary",
                  collapsed ? "" : "lg:hidden",
                )}
                onClick={() => {
                  setOpen(true);
                  if (collapsed) toggleCollapsed(false);
                }}
                aria-label={t("sidebar.open")}
              >
                <Menu className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPaletteOpen(true)}
                className="glass-soft flex h-10 min-w-0 flex-1 max-w-md items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:border-ring"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="truncate">{t("header.search")}</span>
              </button>
              <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  aria-label={t("header.rollDice")}
                  onClick={() => setTrayOpen(true)}
                >
                  <Dices className="h-4 w-4" />
                  <span className="hidden sm:inline">{t("header.roll")}</span>
                </Button>
                <LanguageSelector className="hidden sm:inline-flex" />
                <NotificationBell />
                <ProfileMenu onSignOut={signOut} />
              </div>
            </header>
          </div>

          <main className="safe-b min-h-[calc(100vh-4rem)] px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </main>

          <footer className="no-print border-t border-border px-6 py-6 text-xs leading-relaxed text-muted-foreground">
            {t("footer.disclaimer")}{" "}
            <Link to="/legal" className="underline hover:text-foreground">
              {t("footer.policyLink")}
            </Link>
            .
          </footer>
        </div>

        {open ? (
          <button
            className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
            aria-label={t("sidebar.closeOverlay")}
            onClick={() => setOpen(false)}
          />
        ) : null}
      </div>
    </CampaignSoundtrackProvider>
  );
}
