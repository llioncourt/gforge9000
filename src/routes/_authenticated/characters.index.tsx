import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LayoutGrid, List, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
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
  addEntry,
  createCharacter,
  deleteCharacter,
  getProfilePreferences,
  listCharacters,
  setProfilePreferences,
  type CharactersViewMode,
} from "@/lib/api";
import { portraitUrl } from "@/lib/portrait";
import { useSession } from "@/hooks/use-session";
import { CardPortraitBg } from "@/components/character/card-portrait-bg";
import { cn } from "@/lib/utils";
import { parsePortable } from "@/lib/portable";
import { reconcileImportedEntries } from "@/lib/import-reconcile";
import type { ImportedEntry } from "@/lib/trait-match";
import { ImportDialog } from "@/components/ui/transfer-dialog";

import { AiConversionGuideButton } from "@/components/app/ai-conversion-guide-button";

export const Route = createFileRoute("/_authenticated/characters/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Characters — Universal Character Forge" },
      {
        name: "description",
        content: "All your player characters and NPCs with point budgets and tech levels.",
      },
      { property: "og:title", content: "Characters — Universal Character Forge" },
      { property: "og:description", content: "Browse, import and create characters." },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
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
      toast.success("Character deleted.");
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importCharacterFile = async (
    file: File,
    report: (label: string, percent?: number) => void,
  ) => {
    report("Reading file…", 5);
    const parsed = parsePortable(await file.text());
    const { id: _ignored, ...character } = parsed.character;
    report("Creating character…", 15);
    const row = await createCharacter(character as never);
    report("Matching traits against your content…", 25);
    // Reconcile trait names against enabled content before saving them.
    const { entries } = await reconcileImportedEntries(
      parsed.entries as unknown as ImportedEntry[],
    );
    let done = 0;
    for (const entry of entries) {
      await addEntry({ ...entry, character_id: row.id, data: entry.data ?? {} } as never);
      done += 1;
      report(
        `Importing entries (${done}/${entries.length})…`,
        30 + Math.round((done / Math.max(1, entries.length)) * 65),
      );
    }
    await queryClient.invalidateQueries({ queryKey: ["characters"] });
    setImportOpen(false);
    navigate({ to: "/characters/$id", params: { id: row.id } });
    return `${row.name} imported with ${entries.length} entries.`;
  };

  const rows = (data ?? []).filter((c) =>
    `${c.name} ${c.concept ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Characters"
        description="Player characters, NPCs and templates you own."
        actions={
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-2 h-4 w-4" /> New character
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter by name or concept…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
            <Button
              size="icon"
              variant="ghost"
              className={cn("rounded-none", view === "list" && "bg-secondary")}
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => viewMode.mutate("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn("rounded-none", view === "grid" && "bg-secondary")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => viewMode.mutate("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Import character JSON
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
              No characters yet.
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
                      {c.is_npc ? "NPC" : c.approved ? "Approved" : "Draft"}
                    </Badge>
                  </div>
                  <p className="relative truncate text-xs text-muted-foreground">
                    {c.concept || "No concept set"}
                  </p>
                  <p className="relative text-xs text-muted-foreground">
                    <span className="stat-value">{c.point_budget} pts</span> · TL {c.tech_level}
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
                    aria-label={`Delete ${c.name}`}
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
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Concept</TableHead>
                <TableHead className="w-20 text-right">Budget</TableHead>
                <TableHead className="hidden w-16 text-right md:table-cell">TL</TableHead>
                <TableHead className="w-24">Status</TableHead>
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
                    No characters yet.
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
                      {c.concept || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{c.point_budget}</TableCell>
                    <TableCell className="hidden text-right font-mono md:table-cell">
                      {c.tech_level}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.approved ? "default" : "outline"}>
                        {c.is_npc ? "NPC" : c.approved ? "Approved" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setPendingDelete({ id: c.id, name: c.name })}
                        aria-label={`Delete ${c.name}`}
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
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the character, its entries and its version history. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import character"
        description="Drop a Universal Character Forge JSON export."
        accept="application/json,.json"
        label="Drop the character JSON here, or click to browse"
        hint="Exports produced by this app or converted with the AI guide"
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
