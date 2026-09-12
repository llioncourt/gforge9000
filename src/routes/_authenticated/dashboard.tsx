import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Dices, Plus, Shield, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createCharacter, listCampaigns, listCharacters, listLibrary, listRolls } from "@/lib/api";
import { seedDemoContent } from "@/lib/demo";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Universal Character Forge" },
      {
        name: "description",
        content: "Your characters, campaigns, library entries and recent rolls in one place.",
      },
      { property: "og:title", content: "Dashboard — Universal Character Forge" },
      { property: "og:description", content: "Characters, campaigns and recent rolls." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const characters = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });
  const library = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const rolls = useQuery({ queryKey: ["rolls"], queryFn: () => listRolls(8) });

  const newCharacter = useMutation({
    mutationFn: () => createCharacter({ name: "Untitled character" }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      navigate({ to: "/characters/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seed = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      return seedDemoContent(data.user!.id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      toast.success(
        result.skipped
          ? "Demo content already exists on this account."
          : "Demo character and campaign created.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = characters.isLoading || campaigns.isLoading;
  const empty = !loading && (characters.data?.length ?? 0) === 0 && (campaigns.data?.length ?? 0) === 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Everything on your table right now."
        actions={
          <>
            <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
              <Sparkles className="mr-2 h-4 w-4" /> Load demo data
            </Button>
            <Button onClick={() => newCharacter.mutate()} disabled={newCharacter.isPending}>
              <Plus className="mr-2 h-4 w-4" /> New character
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Shield} label="Characters" value={characters.data?.length} loading={loading} />
        <StatCard icon={Users} label="Campaigns" value={campaigns.data?.length} loading={loading} />
        <StatCard icon={BookOpen} label="Library entries" value={library.data?.length} loading={library.isLoading} />
        <StatCard icon={Dices} label="Rolls logged" value={rolls.data?.length} loading={rolls.isLoading} />
      </div>

      {empty ? (
        <div className="panel mt-6 p-10 text-center">
          <h2 className="font-display text-lg font-semibold">Nothing forged yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Create a blank character, or load the original demo set — a sample expedition campaign
            and a fully built character — to see the engine working end to end.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => newCharacter.mutate()}>New character</Button>
            <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
              Load demo data
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recent characters
          </h2>
          <div className="space-y-2">
            {loading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[68px] w-full rounded-lg" />)
              : characters.data?.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    to="/characters/$id"
                    params={{ id: c.id }}
                    className="panel flex items-center gap-4 p-4 transition-colors hover:border-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.concept || "No concept set"} · TL {c.tech_level}
                      </p>
                    </div>
                    {c.is_npc ? <Badge variant="outline">NPC</Badge> : null}
                    <span className="stat-value shrink-0 text-sm">{c.point_budget} pts</span>
                  </Link>
                ))}
          </div>
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Recent rolls
          </h2>
          <div className="space-y-2">
            {rolls.isLoading ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
            ) : rolls.data?.length ? (
              rolls.data.map((r) => (
                <div key={r.id} className="panel flex items-center gap-3 p-3 text-sm">
                  <span className="stat-value text-base">{r.total}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{r.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.expression}
                      {r.target !== null ? ` vs ${r.target}` : ""}
                    </p>
                  </div>
                  {r.outcome ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {r.outcome}
                    </Badge>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No rolls logged yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Shield;
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-12" />
      ) : (
        <p className="stat-value mt-2 text-3xl">{value ?? 0}</p>
      )}
    </div>
  );
}
