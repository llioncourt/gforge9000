import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  getLibraryEntries,
  importLibraryEntries,
  listCharacters,
  listCampaigns,
  listLibrary,
  updateLibraryEntry,
  withLibraryDetails,
  type LibraryListRow,
} from "@/lib/api";
import {
  download,
  libraryToCsv,
  libraryEntryToCharacterDraft,
  parsePortableLibrary,
  toPortableLibrary,
} from "@/lib/portable";
import { supabase } from "@/integrations/supabase/client";
import { buildLink, loadPackItem } from "@/lib/pack-link-service";
import { invalidatePackLinkQueries } from "@/components/character/pack-link";
import { useSession } from "@/hooks/use-session";
import { useT } from "@/i18n/hooks";
import { metaText } from "@/i18n/meta";

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
    typeof search["item"] === "string" ? { item: search["item"] } : {},
  head: () => ({
    meta: [
      { title: metaText("library", "meta.title") },
      {
        name: "description",
        content: metaText("library", "meta.description"),
      },
      { property: "og:title", content: metaText("library", "meta.title") },
      { property: "og:description", content: metaText("library", "meta.ogDescription") },
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

function toForm(row: LibraryListRow): LibraryForm {
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
  const { t } = useT("library");
  const { t: tc } = useT("common");
  const { data, isLoading } = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const characters = useQuery({ queryKey: ["characters"], queryFn: listCharacters });
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: listCampaigns });
  // What the user is typing, and the value the (expensive) filtering uses.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [packFilter, setPackFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LibraryForm>(blankForm);
  const [pendingDelete, setPendingDelete] = useState<LibraryListRow | null>(null);
  const [foundLabel, setFoundLabel] = useState("");
  const [addTarget, setAddTarget] = useState<LibraryListRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const exportTask = useTransferTask();
  const location = useLocation();
  const itemParam = useMemo(
    () => new URLSearchParams(location.searchStr).get("item") ?? undefined,
    [location.searchStr],
  );

  // Filtering a large catalogue on every keystroke stalls the page; apply the
  // typed value once the user pauses briefly.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 150);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Deep-link from global search: clear filters, scroll to the entry and flash it.
  useEffect(() => {
    const requestedId = itemParam;
    if (!requestedId) return;
    setSearchInput("");
    setSearch("");
    setKindFilter("all");
    setPackFilter("all");
    let attempts = 0;
    let clearTimer = 0;
    const highlight = (el: HTMLElement) => {
      el.scrollIntoView({ behavior: "auto", block: "center" });
      el.classList.add("search-flash");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
      setFoundLabel(
        el.getAttribute("data-search-label") ?? el.textContent?.trim().slice(0, 80) ?? "",
      );
      clearTimer = window.setTimeout(() => {
        el.classList.remove("search-flash");
        window.history.replaceState(window.history.state, "", "/library");
      }, 2500);
    };
    const find = () => {
      const el = document.querySelector(`[data-search-id="${CSS.escape(requestedId)}"]`);
      return el instanceof HTMLElement ? el : null;
    };
    const immediate = find();
    let timer = 0;
    if (immediate) {
      highlight(immediate);
    } else {
      timer = window.setInterval(() => {
        attempts += 1;
        const el = find();
        if (el) {
          window.clearInterval(timer);
          highlight(el);
        } else if (attempts > 120) {
          window.clearInterval(timer);
        }
      }, 25);
    }
    return () => {
      window.clearInterval(timer);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, [itemParam]);

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
      toast.success(form.id ? t("toasts.updated") : t("toasts.created"));
      setOpen(false);
      setForm(blankForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteLibraryEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast.success(t("toasts.removed"));
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importLibraryFile = async (
    file: File,
    report: (label: string, percent?: number) => void,
  ) => {
    report(t("import.reading"), 10);
    const parsed = parsePortableLibrary(await file.text());
    report(t("import.importing", { count: parsed.entries.length }), 45);
    const rows = await importLibraryEntries(parsed.entries as never);
    report(t("import.refreshing"), 90);
    await queryClient.invalidateQueries({ queryKey: ["library"] });
    return t("import.done", { count: rows.length });
  };

  const gateFor = (characterId: string, pack: string | null) => {
    const character = (characters.data ?? []).find((c) => c.id === characterId);
    if (!character?.campaign_id) return null;
    const campaign = (campaigns.data ?? []).find((c) => c.id === character.campaign_id);
    if (!campaign) return null;
    return packGateReason(pack, allowedPacksOf(campaign.settings));
  };

  const addToCharacter = useMutation({
    mutationFn: async ({ entry, characterId }: { entry: LibraryListRow; characterId: string }) => {
      const blocked = gateFor(characterId, entry.pack ?? null);
      if (blocked) throw new Error(blocked);
      // The detail blob is not carried by the list; fetch it for this entry only.
      const [full] = await getLibraryEntries([entry.id]);
      // Adding from the library always records where the entry came from
      // (PL-001); free-text/custom entries are never linked this way.
      const item = entry.pack ? await loadPackItem(supabase, entry.id) : null;
      const link = item?.pack_id ? await buildLink(item, "ui_picker") : null;
      const draft = libraryEntryToCharacterDraft(
        {
          ...entry,
          data: (full?.data ?? {}) as Record<string, unknown>,
        },
        link,
      );
      return addEntry({ ...draft, character_id: characterId } as never);
    },
    onSuccess: (_row, variables) => {
      invalidatePackLinkQueries(queryClient, variables.characterId);
      toast.success(t("toasts.addedToCharacter"));
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

  // Export is the only consumer of the detail blob and of the serialised form,
  // so both are produced when the user exports — never while typing.
  const buildPortable = async () => {
    const detailed = await withLibraryDetails(rows);
    return toPortableLibrary(detailed as unknown as Record<string, unknown>[]);
  };

  // Cards are rendered in chunks so a large catalogue does not build tens of
  // thousands of DOM nodes at once; scrolling reveals the next chunk.
  const PAGE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => {
    setVisibleCount(PAGE);
  }, [search, kindFilter, packFilter, data]);
  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || visibleCount >= rows.length) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((current) => Math.min(current + PAGE, rows.length));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visibleCount, rows.length]);

  // A deep-linked entry may sit past the rendered chunk — reveal up to it.
  useEffect(() => {
    if (!itemParam) return;
    const index = rows.findIndex((row) => row.id === itemParam);
    if (index >= 0 && index >= visibleCount) setVisibleCount(index + 1);
  }, [itemParam, rows, visibleCount]);

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {foundLabel}
      </p>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> {t("actions.import")}
            </Button>
            <Button
              variant="outline"
              disabled={exportTask.busy}
              onClick={() =>
                void exportTask.run(t("export.task"), async (report) => {
                  report(t("export.building"), 40);
                  const portable = await buildPortable();
                  const contents = JSON.stringify(portable, null, 2);
                  report(t("export.downloading"), 85);
                  download("ucf-library.json", contents);
                  return t("export.done", { count: portable.entries.length });
                })
              }
            >
              <Download className="mr-2 h-4 w-4" /> {t("actions.exportJson")}
            </Button>
            <Button
              variant="outline"
              disabled={exportTask.busy}
              onClick={() =>
                void exportTask.run(t("export.taskCsv"), async (report) => {
                  report(t("export.building"), 40);
                  const portable = await buildPortable();
                  const contents = libraryToCsv(portable.entries);
                  report(t("export.downloading"), 85);
                  download("ucf-library.csv", contents, "text/csv");
                  return t("export.done", { count: portable.entries.length });
                })
              }
            >
              {t("actions.exportCsv")}
            </Button>
            <Button
              onClick={() => {
                setForm(blankForm);
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> {t("actions.newEntry")}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-xs"
            placeholder={t("filters.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allKinds")}</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`kinds.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={packFilter} onValueChange={setPackFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("filters.allPacks")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allPacks")}</SelectItem>
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
          {(data ?? []).length === 0 ? t("empty.noEntries") : t("empty.noMatches")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((e) => {
            const mine = e.owner_id === user?.id;
            return (
              <div
                key={e.id}
                id={`library-${e.id}`}
                data-search-id={e.id}
                className="panel flex flex-col p-4 transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`kinds.${e.kind}`, { defaultValue: e.kind })}
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
                  {e.source_page
                    ? ` · ${t("card.sourcePage", { page: e.source_page })}`
                    : ""} · {t(`visibility.${e.visibility}`, { defaultValue: e.visibility })}
                </p>
                <div className="mt-auto flex items-center gap-1 pt-3">
                  <Button size="sm" variant="outline" onClick={() => setAddTarget(e)}>
                    <UserPlus className="mr-1 h-3.5 w-3.5" /> {t("actions.addToCharacter")}
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
                        aria-label={t("actions.editAria", { name: e.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setPendingDelete(e)}
                        aria-label={t("actions.deleteAria", { name: e.name })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div ref={sentinelRef} aria-hidden className="h-1 w-full" />
        </div>
      )}

      {/* Create / edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? t("dialog.editTitle") : t("dialog.newTitle")}</DialogTitle>
            <DialogDescription>{t("dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("dialog.fields.name")}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label={t("dialog.fields.kind")}>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`kinds.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("dialog.fields.category")}>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </Field>
              <Field label={t("dialog.fields.basePoints")}>
                <Input
                  type="number"
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: e.target.value })}
                />
              </Field>
              <Field label={t("dialog.fields.costPerLevel")}>
                <Input
                  type="number"
                  value={form.costPerLevel}
                  onChange={(e) => setForm({ ...form, costPerLevel: e.target.value })}
                />
              </Field>
              <Field label={t("dialog.fields.contentPack")}>
                <Input
                  value={form.pack}
                  placeholder={DEFAULT_PACK_NAME}
                  onChange={(e) => setForm({ ...form, pack: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t("dialog.fields.notes")}>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <Field label={t("dialog.fields.tags")}>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("dialog.fields.sourceLabel")}>
                <Input
                  value={form.sourceLabel}
                  onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })}
                />
              </Field>
              <Field label={t("dialog.fields.edition")}>
                <Input
                  value={form.sourceEdition}
                  onChange={(e) => setForm({ ...form, sourceEdition: e.target.value })}
                />
              </Field>
              <Field label={t("dialog.fields.pageRef")}>
                <Input
                  value={form.sourcePage}
                  onChange={(e) => setForm({ ...form, sourcePage: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label>{t("dialog.sharePublicly")}</Label>
                <p className="text-xs text-muted-foreground">{t("dialog.sharePubliclyHint")}</p>
              </div>
              <Switch
                checked={form.visibility === "public"}
                onCheckedChange={(v) => setForm({ ...form, visibility: v ? "public" : "private" })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
              {form.id ? t("dialog.saveChanges") : t("dialog.createEntry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to character */}
      <Dialog open={!!addTarget} onOpenChange={(v) => !v && setAddTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addDialog.title", { name: addTarget?.name })}</DialogTitle>
            <DialogDescription>{t("addDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {(characters.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("addDialog.noCharacters")}</p>
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
                    {gateFor(c.id, addTarget?.pack ?? null) ??
                      (c.is_npc ? t("addDialog.npc") : t("addDialog.pc"))}
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
            <AlertDialogTitle>
              {t("deleteDialog.title", { name: pendingDelete?.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDialog.description")}</AlertDialogDescription>
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
        title={t("import.title")}
        description={t("import.description")}
        accept="application/json,.json"
        label={t("import.dropLabel")}
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
