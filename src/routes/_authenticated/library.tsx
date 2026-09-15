import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { allowedPacksOf, packGateReason, DEFAULT_PACK_NAME } from "@/lib/packs";
import { rankSearch } from "@/lib/search";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportDialog, useTransferTask } from "@/components/ui/transfer-dialog";
import { AiConversionGuideButton } from "@/components/app/ai-conversion-guide-button";
import {
  addEntry,
  createLibraryEntry,
  deleteLibraryEntry,
  importLibraryEntries,
  listCharacters,
  listCampaigns,
  listLibrary,
  updateLibraryEntry,
  type LibraryRow,
} from "@/lib/api";
import {
  download,
  libraryToCsv,
  libraryEntryToCharacterDraft,
  parsePortableLibrary,
  toPortableLibrary,
} from "@/lib/portable";
import { useSession } from "@/hooks/use-session";

const KINDS = [
  "advantage",
  "disadvantage",
  "perk",
  "quirk",
  "skill",
  "technique",
  "spell",
  "equipment",
  "language",
  "culture",
  "custom",
] as const;

export const Route = createFileRoute("/_authenticated/library")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { item?: string } =>
    typeof search['item'] === "string" ? { item: search['item'] } : {},
  head: () => ({
    meta: [
      { title: "Library — Universal Character Forge" },
      {
        name: "description",
        content:
          "Custom traits, skills and equipment you can reuse across characters and campaigns.",
      },
      { property: "og:title", content: "Library — Universal Character Forge" },
      { property: "og:description", content: "Reusable custom content with source provenance." },
    ],
  }),
  component: LibraryPage,
});

interface LibraryForm {
  id?: string;
  name: string;
  kind: string;
  category: string;
  points: string;
  costPerLevel: string;
  notes: string;
  tags: string;
  pack: string;
  sourceLabel: string;
  sourceEdition: string;
  sourcePage: string;
  visibility: string;
}

const blankForm: LibraryForm = {
  name: "",
  kind: "advantage",
  category: "",
  points: "0",
  costPerLevel: "0",
  notes: "",
  tags: "",
  pack: DEFAULT_PACK_NAME,
  sourceLabel: "User created",
  sourceEdition: "",
  sourcePage: "",
  visibility: "private",
};

function toForm(row: LibraryRow): LibraryForm {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    category: row.category ?? "",
    points: String(row.base_points ?? 0),
    costPerLevel: String(row.cost_per_level ?? 0),
    notes: row.summary ?? "",
    tags: (row.tags ?? []).join(", "),
    pack: row.pack ?? DEFAULT_PACK_NAME,
    sourceLabel: row.source_label ?? "User created",
    sourceEdition: row.source_edition ?? "",
    sourcePage: row.source_page ?? "",
    visibility: row.visibility ?? "private",
  };
}

function LibraryPage() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const characters = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [packFilter, setPackFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LibraryForm>(blankForm);
  const [pendingDelete, setPendingDelete] = useState<LibraryRow | null>(null);
  const [addTarget, setAddTarget] = useState<LibraryRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const exportTask = useTransferTask();
  const { item: itemParam } = Route.useSearch();
  const navigate = useNavigate();
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Deep-link from global search: clear filters, scroll to the entry and flash it.
  useEffect(() => {
    if (!itemParam) return;
    setSearch("");
    setKindFilter("all");
    setPackFilter("all");
    let attempts = 0;
    let clearTimer = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const el = document.querySelector(`[data-search-id="${CSS.escape(itemParam)}"]`);
      if (el instanceof HTMLElement) {
        window.clearInterval(timer);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightId(itemParam);
        clearTimer = window.setTimeout(() => setHighlightId(null), 2600);
        void navigate({ to: "/library", search: {}, replace: true });
      } else if (attempts > 40) {
        window.clearInterval(timer);
      }
    }, 200);
    return () => {
      window.clearInterval(timer);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, [itemParam, navigate]);


  const packs = useMemo(() => {
    const set = new Set<string>();
    for (const row of data ?? []) if (row.pack) set.add(row.pack);
    return [...set].sort();
  }, [data]);

  const payload = (f: LibraryForm) => ({
    name: f.name,
    kind: f.kind,
    category: f.category || null,
    base_points: Number(f.points) || 0,
    cost_per_level: Number(f.costPerLevel) || 0,
    summary: f.notes || null,
    tags: f.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    pack: f.pack.trim() || DEFAULT_PACK_NAME,
    source_label: f.sourceLabel || "User created",
    source_edition: f.sourceEdition || null,
    source_page: f.sourcePage || null,
    source_type: "user",
    visibility: f.visibility,
  });

  const save = useMutation({
    mutationFn: () =>
      form.id
        ? updateLibraryEntry(form.id, payload(form) as never)
        : createLibraryEntry({ ...payload(form), data: {} } as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast.success(form.id ? "Entry updated." : "Library entry created.");
      setOpen(false);
      setForm(blankForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteLibraryEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast.success("Entry removed.");
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importLibraryFile = async (
    file: File,
    report: (label: string, percent?: number) => void,
  ) => {
    report("Reading file…", 10);
    const parsed = parsePortableLibrary(await file.text());
    report(`Importing ${parsed.entries.length} entries…`, 45);
    const rows = await importLibraryEntries(parsed.entries as never);
    report("Refreshing library…", 90);
    await queryClient.invalidateQueries({ queryKey: ["library"] });
    return `Imported ${rows.length} entr${rows.length === 1 ? "y" : "ies"}.`;
  };

  const gateFor = (characterId: string, pack: string | null) => {
    const character = (characters.data ?? []).find((c) => c.id === characterId);
    if (!character?.campaign_id) return null;
    const campaign = (campaigns.data ?? []).find((c) => c.id === character.campaign_id);
    if (!campaign) return null;
    return packGateReason(pack, allowedPacksOf(campaign.settings));
  };

  const addToCharacter = useMutation({
    mutationFn: async ({ entry, characterId }: { entry: LibraryRow; characterId: string }) => {
      const blocked = gateFor(characterId, entry.pack ?? null);
      if (blocked) throw new Error(blocked);
      const draft = libraryEntryToCharacterDraft({
        ...entry,
        data: (entry.data ?? {}) as Record<string, unknown>,
      });
      return addEntry({ ...draft, character_id: characterId } as never);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
      toast.success("Added to character.");
      setAddTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const base = (data ?? []).filter(
      (e) =>
        (kindFilter === "all" || e.kind === kindFilter) &&
        (packFilter === "all" || (e.pack ?? "") === packFilter),
    );
    return rankSearch(search, base, (e) => ({
      name: e.name,
      fields: [e.category, e.summary, e.pack, ...(e.tags ?? [])],
    }));
  }, [data, kindFilter, packFilter, search]);

  const portable = toPortableLibrary((rows ?? []) as unknown as Record<string, unknown>[]);

  return (
    <div>
      <PageHeader
        title="Library"
        description="Your own traits, skills and gear, grouped into content packs with full provenance."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
            <Button
              variant="outline"
              disabled={exportTask.busy}
              onClick={() =>
                void exportTask.run("Exporting library (JSON)", async (report) => {
                  report("Building file…", 40);
                  const contents = JSON.stringify(portable, null, 2);
                  report("Downloading…", 85);
                  download("ucf-library.json", contents);
                  return `Exported ${portable.entries.length} entries.`;
                })
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
            <Button
              variant="outline"
              disabled={exportTask.busy}
              onClick={() =>
                void exportTask.run("Exporting library (CSV)", async (report) => {
                  report("Building file…", 40);
                  const contents = libraryToCsv(portable.entries);
                  report("Downloading…", 85);
                  download("ucf-library.csv", contents, "text/csv");
                  return `Exported ${portable.entries.length} entries.`;
                })
              }
            >
              CSV
            </Button>
            <Button
              onClick={() => {
                setForm(blankForm);
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New entry
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-xs"
            placeholder="Search library…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={packFilter} onValueChange={setPackFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All packs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All packs</SelectItem>
              {packs.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <AiConversionGuideButton kind="library" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[168px] w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          {(data ?? []).length === 0
            ? "Your library is empty. Create an entry, or import a library export."
            : "No library entries match these filters."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((e) => {
            const mine = e.owner_id === user?.id;
            return (
              <div key={e.id} data-search-id={e.id} className="panel flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.kind}
                      {e.category ? ` · ${e.category}` : ""}
                    </p>
                  </div>
                  <span className="stat-value text-sm">{e.base_points}</span>
                </div>
                {e.summary ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{e.summary}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1">
                  {e.pack ? <Badge className="text-[10px]">{e.pack}</Badge> : null}
                  {(e.tags ?? []).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {e.source_label}
                  {e.source_edition ? ` · ${e.source_edition}` : ""}
                  {e.source_page ? ` · p.${e.source_page}` : ""} · {e.visibility}
                </p>
                <div className="mt-auto flex items-center gap-1 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setAddTarget(e)}>
                    <UserPlus className="mr-1 h-3.5 w-3.5" /> Add to character
                  </Button>
                  {mine ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => {
                          setForm(toForm(e));
                          setOpen(true);
                        }}
                        aria-label={`Edit ${e.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setPendingDelete(e)}
                        aria-label={`Delete ${e.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit library entry" : "New library entry"}</DialogTitle>
            <DialogDescription>
              Enter your own content only. Do not paste text you are not licensed to reproduce.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Kind">
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Category">
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </Field>
              <Field label="Base points">
                <Input
                  type="number"
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: e.target.value })}
                />
              </Field>
              <Field label="Cost per level">
                <Input
                  type="number"
                  value={form.costPerLevel}
                  onChange={(e) => setForm({ ...form, costPerLevel: e.target.value })}
                />
              </Field>
              <Field label="Content pack">
                <Input
                  value={form.pack}
                  placeholder={DEFAULT_PACK_NAME}
                  onChange={(e) => setForm({ ...form, pack: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <Field label="Tags (comma separated)">
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Source label">
                <Input
                  value={form.sourceLabel}
                  onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })}
                />
              </Field>
              <Field label="Edition">
                <Input
                  value={form.sourceEdition}
                  onChange={(e) => setForm({ ...form, sourceEdition: e.target.value })}
                />
              </Field>
              <Field label="Page ref">
                <Input
                  value={form.sourcePage}
                  onChange={(e) => setForm({ ...form, sourcePage: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label>Share publicly</Label>
                <p className="text-xs text-muted-foreground">
                  Public entries are readable by every signed-in user.
                </p>
              </div>
              <Switch
                checked={form.visibility === "public"}
                onCheckedChange={(v) => setForm({ ...form, visibility: v ? "public" : "private" })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
              {form.id ? "Save changes" : "Create entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to character */}
      <Dialog open={!!addTarget} onOpenChange={(v) => !v && setAddTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add “{addTarget?.name}” to a character</DialogTitle>
            <DialogDescription>
              The entry is copied onto the sheet, including its source provenance. Edit it there.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {(characters.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no characters yet.</p>
            ) : (
              characters.data?.map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  className="w-full justify-between"
                  disabled={addToCharacter.isPending || !!gateFor(c.id, addTarget?.pack ?? null)}
                  onClick={() =>
                    addTarget && addToCharacter.mutate({ entry: addTarget, characterId: c.id })
                  }
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {gateFor(c.id, addTarget?.pack ?? null) ?? (c.is_npc ? "NPC" : "PC")}
                  </span>
                </Button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the library entry. Characters that already use it keep their copy.
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
        title="Import library"
        description="Drop a Universal Character Forge library JSON file."
        accept="application/json,.json"
        label="Drop the library JSON here, or click to browse"
        run={importLibraryFile}
      />
      {exportTask.node}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
