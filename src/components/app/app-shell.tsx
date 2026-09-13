import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Boxes,
  Dices,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Shield,
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

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/characters", label: "Characters", icon: Shield },
  { to: "/campaigns", label: "Campaigns", icon: Users },
  { to: "/library", label: "Library", icon: BookOpen },
  { to: "/packs", label: "Packs", icon: Boxes },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setOpen(false), [pathname]);

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
          "no-print fixed inset-y-0 left-0 z-40 w-[17rem] max-w-[85vw] border-r border-sidebar-border/70 bg-sidebar/80 backdrop-blur-xl transition-transform duration-300 ease-out will-change-transform lg:w-64 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <div className="grid h-8 w-8 place-content-center rounded-md bg-primary text-primary-foreground">
            <Dices className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-sidebar-foreground">
              Character Forge
            </p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              GURPS 4e compatible
            </p>
          </div>
          <button
            className="ml-auto text-muted-foreground lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="space-y-1 p-3">
          {NAV.map(({ to, label, icon: Icon }) => (
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
              {label}
            </Link>
          ))}
        </nav>

        <div className="absolute inset-x-0 bottom-0 space-y-2 border-t border-sidebar-border p-3">
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => setTrayOpen(true)}>
            <Dices className="h-4 w-4" /> Dice tray
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
          <Link to="/legal" className="block px-2 text-[11px] text-muted-foreground hover:text-foreground">
            Unofficial companion · Legal & content policy
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="glass-bar no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/70 px-3 sm:gap-3 sm:px-4">
          <button
            className="-ml-1 grid h-10 w-10 shrink-0 place-content-center rounded-md text-foreground transition-colors hover:bg-secondary lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            className="glass-soft flex h-10 min-w-0 flex-1 max-w-md items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:border-ring"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="truncate">
              <span className="sm:hidden">Search…</span>
              <span className="hidden sm:inline">Search characters, campaigns, library…</span>
            </span>
            <kbd className="ml-auto hidden rounded sm:inline-block border border-border px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            aria-label="Roll dice"
            onClick={() => setTrayOpen(true)}
          >

            <Dices className="h-4 w-4" />
            <span className="hidden sm:inline">Roll</span>
          </Button>
        </header>

        <main className="safe-b min-h-[calc(100vh-4rem)] px-3 py-5 sm:px-6 sm:py-6 lg:px-8">
          {children}
        </main>

        <footer className="no-print border-t border-border px-6 py-6 text-xs leading-relaxed text-muted-foreground">
          Universal Character Forge is an unofficial, independent companion tool. GURPS is a
          trademark of Steve Jackson Games Incorporated; this project is not affiliated with,
          endorsed or sponsored by Steve Jackson Games. No rulebook text, tables or artwork are
          reproduced here. <Link to="/legal" className="underline hover:text-foreground">Read the full policy</Link>.
        </footer>
      </div>

      {open ? (
        <button
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-sm lg:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}
    </div>
    </CampaignSoundtrackProvider>
  );
}
