import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutGrid, List, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n/hooks";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  addEntries,
  createCharacter,
  deleteCharacter,
  deleteEntriesOf,
  findCharacterByImportKey,
  getProfilePreferences,
  listCharacters,
  setProfilePreferences,
  updateCharacter,
  type CharactersViewMode,
} from "@/lib/api";
import { portraitUrl } from "@/lib/portrait";
import { useSession } from "@/hooks/use-session";
import { CardPortraitBg } from "@/components/character/card-portrait-bg";
import { cn } from "@/lib/utils";
import { parsePortable } from "@/lib/portable";
import { runCharacterImport } from "@/lib/character-import";
import { reconcileImportedEntries } from "@/lib/import-reconcile";
import { ImportDialog } from "@/components/ui/transfer-dialog";
import { metaText } from "@/i18n/meta";

import { AiConversionGuideButton } from "@/components/app/ai-conversion-guide-button";

export const Route = createFileRoute("/_authenticated/characters/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: metaText("characters", "meta.listTitle") },
      {
        name: "description",
        content: metaText("characters", "meta.listDescription"),
      },
      { property: "og:title", content: metaText("characters", "meta.listTitle") },
      { property: "og:description", content: metaText("characters", "meta.listOgDescription") },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
  const { t } = useT("characters");
  const { t: tc } = useT("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const { user } = useSession();
  const prefsQuery = useQuery({
    queryKey: ["profile-preferences", user?.id],
    queryFn: () => getProfilePreferences(user!.id),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  const view: CharactersViewMode = prefsQuery.data?.characters_view === "grid" ? "grid" : "list";
  const viewMode = useMutation({
    mutationFn: (v: CharactersViewMode) => setProfilePreferences(user!.id, { characters_view: v }),
    onMutate: (v) => {
      queryClient.setQueryData(["profile-preferences", user?.id], {
        ...(prefsQuery.data ?? {}),
        characters_view: v,
      });
    },
  });

  const create = useMutation({
    mutationFn: () => createCharacter({ name: "Untitled character" }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      navigate({ to: "/characters/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCharacter(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      toast.success(t("list.deleteSuccess"));
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importCharacterFile = async (
    file: File,
    report: (label: string, percent?: number) => void,
  ) => {
    report(t("list.import.readingFile"), 5);
    const parsed = parsePortable(await file.text());
    report(t("list.import.creatingCharacter"), 15);
    try {
      const result = await runCharacterImport(
        parsed,
        {
          findByImportKey: findCharacterByImportKey,
          createCharacter: (input) => createCharacter(input as never),
          updateCharacter: (id, patch) => updateCharacter(id, patch as never),
          deleteCharacter,
          deleteEntriesOf,
          addEntries: async (characterId, entries) => {
            await addEntries(
              entries.map(
                (entry) => ({ ...entry, character_id: characterId, data: entry.data ?? {} }) as never,
              ),
            );
          },
          // Reconcile trait names against enabled content before saving them.
          reconcile: (entries) => reconcileImportedEntries(entries),
        },
        (stage, done, total) => {
          if (stage === "matching") report(t("list.import.matchingTraits"), 25);
          else
            report(
              t("list.import.importingEntries", { done: done ?? 0, total: total ?? 0 }),
              30 + Math.round(((done ?? 0) / Math.max(1, total ?? 1)) * 65),
            );
        },
      );
      await queryClient.invalidateQueries({ queryKey: ["characters"] });
      setImportOpen(false);
      navigate({ to: "/characters/$id", params: { id: result.id } });
      return t("list.import.success", { name: result.name, count: result.entries });
    } catch (error) {
      await queryClient.invalidateQueries({ queryKey: ["characters"] });
      throw error;
    }
  };


  const rows = (data ?? []).filter((c) =>
    `${c.name} ${c.concept ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title={t("list.title")}
        description={t("list.description")}
        actions={
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-2 h-4 w-4" /> {t("list.newCharacter")}
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("list.filterPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
            <Button
              size="icon"
              variant="ghost"
              className={cn("rounded-none", view === "list" && "bg-secondary")}
              aria-label={t("list.listView")}
              aria-pressed={view === "list"}
              onClick={() => viewMode.mutate("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn("rounded-none", view === "grid" && "bg-secondary")}
              aria-label={t("list.gridView")}
              aria-pressed={view === "grid"}
              onClick={() => viewMode.mutate("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> {t("list.importButton")}
          </Button>
          <AiConversionGuideButton kind="character" />
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[120px] w-full" />)
          ) : rows.length === 0 ? (
            <div className="panel py-10 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              {t("list.empty")}
            </div>
          ) : (
            rows.map((c) => (
              <div key={c.id} className="relative">
                <Link
                  to="/characters/$id"
                  params={{ id: c.id }}
                  className="panel relative flex h-full min-h-[120px] flex-col justify-end gap-1 overflow-hidden p-4 transition-colors hover:border-ring"
                >
                  <CardPortraitBg path={c.portrait_path} />
                  <div className="relative flex items-center justify-between gap-2">
                    <p className="truncate font-medium">{c.name}</p>
                    <Badge variant={c.approved ? "default" : "outline"} className="shrink-0">
                      {c.is_npc ? t("list.npc") : c.approved ? t("list.approved") : t("list.draft")}
                    </Badge>
                  </div>
                  <p className="relative truncate text-xs text-muted-foreground">
                    {c.concept || t("list.noConcept")}
                  </p>
                  <p className="relative text-xs text-muted-foreground">
                    <span className="stat-value">{t("list.points", { count: c.point_budget })}</span> · TL {c.tech_level}
                  </p>
                </Link>
                <div
                  className="absolute bottom-2 right-2 z-10"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setPendingDelete({ id: c.id, name: c.name })}
                    aria-label={t("list.deleteAria", { name: c.name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("list.table.name")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("list.table.concept")}</TableHead>
                <TableHead className="w-20 text-right">{t("list.table.budget")}</TableHead>
                <TableHead className="hidden w-16 text-right md:table-cell">{t("list.table.tl")}</TableHead>
                <TableHead className="w-24">{t("list.table.status")}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [0, 1, 2, 3].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-md" />
                        <Skeleton className="h-6 flex-1" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {t("list.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link
                        to="/characters/$id"
                        params={{ id: c.id }}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <PortraitThumb path={c.portrait_path} name={c.name} />
                        <span className="truncate">{c.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {c.concept || t("list.table.noValue")}
                    </TableCell>
                    <TableCell className="text-right font-mono">{c.point_budget}</TableCell>
                    <TableCell className="hidden text-right font-mono md:table-cell">
                      {c.tech_level}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.approved ? "default" : "outline"}>
                        {c.is_npc ? t("list.npc") : c.approved ? t("list.approved") : t("list.draft")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setPendingDelete({ id: c.id, name: c.name })}
                        aria-label={t("list.deleteAria", { name: c.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("list.deleteConfirmTitle", { name: pendingDelete?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("list.deleteConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}>
              {tc("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t("list.import.title")}
        description={t("list.import.description")}
        accept="application/json,.json"
        label={t("list.import.label")}
        hint={t("list.import.hint")}
        run={importCharacterFile}
      />
    </div>
  );
}

function PortraitThumb({ path, name }: { path: string | null; name: string }) {
  const { data: url } = useQuery({
    queryKey: ["portrait", path ?? "none"],
    queryFn: () => portraitUrl(path),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-content-center overflow-hidden rounded-md bg-secondary text-xs font-semibold text-muted-foreground">
      {url ? (
        <img
          loading="lazy"
          decoding="async"
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        initials || "?"
      )}
    </span>
  );
}
