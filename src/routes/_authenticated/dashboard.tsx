import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Dices, Plus, Shield, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { countLibrary, createCharacter, listCampaigns, listCharacters, listRolls } from "@/lib/api";
import { CardPortraitBg } from "@/components/character/card-portrait-bg";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

export const Route = createFileRoute("/_authenticated/dashboard")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: metaText("dashboard", "meta.title") },
      {
        name: "description",
        content: metaText("dashboard", "meta.description"),
      },
      { property: "og:title", content: metaText("dashboard", "meta.title") },
      { property: "og:description", content: metaText("dashboard", "meta.ogDescription") },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useT("dashboard");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const characters = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });
  const library = useQuery({ queryKey: ["library-count"], queryFn: countLibrary });
  const rolls = useQuery({ queryKey: ["rolls"], queryFn: () => listRolls(8) });

  const newCharacter = useMutation({
    mutationFn: () => createCharacter({ name: "Untitled character" }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      navigate({ to: "/characters/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = characters.isLoading || campaigns.isLoading;
  const empty =
    !loading && (characters.data?.length ?? 0) === 0 && (campaigns.data?.length ?? 0) === 0;

  return (
    <div>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <>
            <Button onClick={() => newCharacter.mutate()} disabled={newCharacter.isPending}>
              <Plus className="mr-2 h-4 w-4" /> {t("page.newCharacter")}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Shield}
          label={t("stats.characters")}
          value={characters.data?.length}
          loading={loading}
        />
        <StatCard
          icon={Users}
          label={t("stats.campaigns")}
          value={campaigns.data?.length}
          loading={loading}
        />
        <StatCard
          icon={BookOpen}
          label={t("stats.libraryEntries")}
          value={library.data}
          loading={library.isLoading}
        />
        <StatCard
          icon={Dices}
          label={t("stats.rollsLogged")}
          value={rolls.data?.length}
          loading={rolls.isLoading}
        />
      </div>

      {empty ? (
        <div className="panel mt-6 p-10 text-center">
          <h2 className="font-display text-lg font-semibold">{t("empty.title")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {t("empty.description")}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => newCharacter.mutate()}>{t("page.newCharacter")}</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 lg:col-span-2">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {t("sections.recentCharacters")}
          </h2>
          <div className="space-y-2">
            {loading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[68px] w-full rounded-lg" />)
              : characters.data?.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    to="/characters/$id"
                    params={{ id: c.id }}
                    className="panel relative flex items-center gap-4 overflow-hidden p-4 transition-colors hover:border-ring"
                  >
                    <CardPortraitBg path={c.portrait_path} />
                    <div className="relative min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.concept || t("character.noConcept")} ·{" "}
                        {t("character.techLevel", { level: c.tech_level })}
                      </p>
                    </div>
                    {c.is_npc ? (
                      <Badge variant="outline" className="relative">
                        {t("character.npc")}
                      </Badge>
                    ) : null}
                    <span className="stat-value relative shrink-0 text-sm">
                      {t("character.points", { count: c.point_budget })}
                    </span>
                  </Link>
                ))}
          </div>
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {t("sections.recentRolls")}
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
                      {r.target !== null ? ` ${t("rolls.vsTarget", { target: r.target })}` : ""}
                    </p>
                  </div>
                  {r.outcome ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {t(`rolls.outcome.${r.outcome}`, { defaultValue: r.outcome })}
                    </Badge>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t("rolls.none")}</p>
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
