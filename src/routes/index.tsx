import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Calculator, Dices, Layers, ScrollText, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Universal Character Forge — GURPS 4e compatible companion" },
      {
        name: "description",
        content:
          "Build characters, track campaigns and roll dice with a data-driven rules engine. Unofficial companion compatible with GURPS Fourth Edition.",
      },
      {
        property: "og:title",
        content: "Universal Character Forge — GURPS 4e compatible companion",
      },
      {
        property: "og:description",
        content:
          "Point budgets, live calculation, combat sheets, campaigns and a custom content library.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Calculator,
    title: "Live point engine",
    body: "Attributes, traits, skills and encumbrance recalculate deterministically through a tested rules layer — not scattered UI maths.",
  },
  {
    icon: Layers,
    title: "Everything is data",
    body: "Traits carry cost, levels, modifiers, prerequisites, tags, visibility and source metadata. Add your own, or import packs later.",
  },
  {
    icon: Dices,
    title: "Rollable sheet",
    body: "Click any skill or attack to roll 3d6 against its target number and see margin of success at a glance.",
  },
  {
    icon: Users,
    title: "Campaigns & GM tools",
    body: "Invite codes, character approval, roster with combat-ready stat cards, shared notes, handouts and private GM notes.",
  },
  {
    icon: ScrollText,
    title: "Portable by default",
    body: "JSON export/import is the canonical format, with CSV extracts and a printable sheet.",
  },
  {
    icon: Shield,
    title: "Your content, your rules",
    body: "No rulebook text is bundled. Seed content is original and generic; campaign house rules override engine formulas.",
  },
];

function Landing() {
  const { user, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-content-center rounded-md bg-primary text-primary-foreground">
            <Dices className="h-4 w-4" />
          </div>
          <span className="font-display text-sm font-semibold">Universal Character Forge</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/legal" className="text-sm text-muted-foreground hover:text-foreground">
            Legal
          </Link>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <section className="grid-noise border-y border-border">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <p className="mb-4 inline-flex items-center rounded-full border border-border px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
            GURPS 4e compatible · unofficial
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-6xl">
            A modern forge for universal characters
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Point budgets that add up, a combat-ready sheet you can roll from, and campaigns your
            table can actually run — built on an open, data-driven rules engine.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Start building</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/legal">Content policy</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="panel p-6">
              <Icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-display text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-6 py-10 text-center text-xs leading-relaxed text-muted-foreground">
        GURPS is a trademark of Steve Jackson Games Incorporated. Universal Character Forge is an
        unofficial, independent tool and is not affiliated with, endorsed or sponsored by Steve
        Jackson Games. No rulebook text, tables or artwork are reproduced.{" "}
        <Link to="/legal" className="underline hover:text-foreground">
          Full policy
        </Link>
        .
      </footer>
    </div>
  );
}
