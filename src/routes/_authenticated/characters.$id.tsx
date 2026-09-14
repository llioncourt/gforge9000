import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Dices,
  History,
  Info,
  Pencil,
  Plus,
  Printer,
  Save,
  Copy,
  Sparkles,
  Trash2,
} from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addEntry,
  deleteEntry,
  getCharacter,
  listEntries,
  listVersions,
  restoreVersion,
  saveVersion,
  getCampaign,
  toCharacterRecord,
  toEntry,
  updateCharacter,
  updateEntry,
  duplicateCharacter,
  type CharacterRow,
  type VersionRow,
} from "@/lib/api";
import {
  buildSheet,
  normalizeWeaponMode,
  type CharacterEntry,
  type EntryKind,
  type WeaponMode,
} from "@/rules";
import { AttackModeCard } from "@/components/character/attack-mode-card";
import {
  attackModeKey,
  currentShotsFor,
  listWeaponState,
  toWeaponStateMap,
  upsertWeaponState,
} from "@/lib/weapon-state";
import { useDice } from "@/components/app/dice-context";
import { PointsBar } from "@/components/character/stat-bar";
import {
  EntryDialog,
  emptyDraft,
  toDraft,
  type EntryDraft,
} from "@/components/character/entry-dialog";
import {
  download,
  entriesToCsv,
  libraryEntryToCharacterDraft,
  slugify,
  toPortable,
} from "@/lib/portable";
import {
  CharacterPacksPanel,
  PackPickerDialog,
  isCustomEntry,
} from "@/components/character/pack-content";
import type { LibraryRow } from "@/lib/api";
import { PortraitPanel, usePortraitUrl } from "@/components/character/portrait";
import { ModelPanel } from "@/components/character/model-panel";
import { parseModelTransform } from "@/lib/model3d";
import { allowedPacksOf } from "@/lib/packs";
import { buildImagePrompt } from "@/lib/image-prompt";

import { PrintSheet } from "@/components/character/print-sheet";


export const Route = createFileRoute("/_authenticated/characters/$id")({
  staticData: { sitemap: false },
  head: ({ params }) => {
    const title = `Character sheet ${params.id.slice(0, 8)} — Universal Character Forge`;
    const description =
      "Live point totals, traits, skills, equipment, encumbrance and a rollable combat sheet for this character.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },

  component: CharacterPage,
});

const TRAIT_KINDS: EntryKind[] = ["advantage", "disadvantage", "perk", "quirk", "custom"];
const LORE_KINDS: EntryKind[] = ["language", "culture"];
const APPEARANCE_FIELDS: [string, string][] = [
  ["age", "Age"],
  ["height", "Height"],
  ["weight", "Weight"],
  ["build", "Build"],
  ["hair", "Hair"],
  ["eyes", "Eyes"],
  ["handedness", "Handedness"],
  ["languages_note", "Cultural / language note"],
];

function CharacterPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { roll, history } = useDice();

  const characterQuery = useQuery({ queryKey: ["character", id], queryFn: () => getCharacter(id) });
  const entriesQuery = useQuery({ queryKey: ["entries", id], queryFn: () => listEntries(id) });
  const versionsQuery = useQuery({ queryKey: ["versions", id], queryFn: () => listVersions(id) });
  const weaponStateQuery = useQuery({
    queryKey: ["weapon-state", id],
    queryFn: () => listWeaponState(id),
  });

  const [form, setForm] = useState<CharacterRow | null>(null);
  const [conditionInput, setConditionInput] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<VersionRow | null>(null);
  const dirty = useRef(false);
  const printPortraitUrl = usePortraitUrl(form?.portrait_path ?? null);


  useEffect(() => {
    if (characterQuery.data && !dirty.current) setForm(characterQuery.data);
  }, [characterQuery.data]);

  const save = useMutation({
    mutationFn: (patch: Partial<CharacterRow>) => updateCharacter(id, patch),
    onSuccess: () => {
      dirty.current = false;
      setSaveError(false);
      queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
    onError: (e: Error) => {
      setSaveError(true);
      toast.error(e.message);
    },
  });

  // Debounced autosave of the character record.
  useEffect(() => {
    if (!form || !dirty.current) return;
    const timer = setTimeout(() => {
      const { id: _i, owner_id: _o, created_at: _c, updated_at: _u, ...patch } = form;
      save.mutate(patch);
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const patch = (p: Partial<CharacterRow>) => {
    dirty.current = true;
    setForm((prev) => (prev ? { ...prev, ...p } : prev));
  };

  const entries: CharacterEntry[] = useMemo(
    () => (entriesQuery.data ?? []).map(toEntry),
    [entriesQuery.data],
  );
  const sheet = useMemo(
    () => (form ? buildSheet(toCharacterRecord(form), entries) : null),
    [form, entries],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft("advantage"));

  const upsertEntry = useMutation({
    mutationFn: async (d: EntryDraft) => {
      const payload = {
        character_id: id,
        kind: d.kind,
        name: d.name,
        category: d.category || null,
        points: d.points,
        levels: d.levels,
        notes: d.notes || null,
        data: d.data as never,
        source: d.source as never,
      };
      return d.id ? updateEntry(d.id, payload) : addEntry(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries", id] });
      setDialogOpen(false);
      toast.success("Saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEntry = useMutation({
    mutationFn: deleteEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entries", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const snapshot = useMutation({
    mutationFn: () => saveVersion(id, new Date().toLocaleString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["versions", id] });
      toast.success("Version saved.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: restoreVersion,
    onSuccess: () => {
      dirty.current = false;
      queryClient.invalidateQueries();
      toast.success("Version restored.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clone = useMutation({
    mutationFn: () => duplicateCharacter(id),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      toast.success(`Created “${copy.name}”.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Hand-typed entries are explicitly custom content, never pack content.
  function openNew(kind: EntryKind) {
    setDraft({
      ...emptyDraft(kind),
      source: { label: "Custom", edition: "", page: "", type: "custom" },
    });
    setDialogOpen(true);
  }
  function openEdit(entry: CharacterEntry) {
    setDraft(toDraft(entry));
    setDialogOpen(true);
  }

  const [pickerKinds, setPickerKinds] = useState<EntryKind[] | null>(null);
  const linkedPacks = form?.packs ?? [];

  // When the character belongs to a campaign, the campaign's enabled packs are
  // automatically available on the sheet (unioned with the character's own).
  const campaignQuery = useQuery({
    queryKey: ["campaign", form?.campaign_id],
    queryFn: () => getCampaign(form!.campaign_id!),
    enabled: !!form?.campaign_id,
  });
  const campaignPacks = useMemo(
    () => allowedPacksOf(campaignQuery.data?.settings),
    [campaignQuery.data],
  );
  const effectivePacks = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...linkedPacks, ...campaignPacks]) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    }
    return out;
  }, [linkedPacks, campaignPacks]);

  const addFromPack = useMutation({
    mutationFn: async (entry: LibraryRow) => {
      const draftRow = libraryEntryToCharacterDraft({
        ...entry,
        data: (entry.data ?? {}) as Record<string, unknown>,
      });
      return addEntry({ ...draftRow, character_id: id } as never);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries", id] });
      toast.success("Added from pack.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form || !sheet) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  const appearance = (form.appearance ?? {}) as Record<string, string>;
  const campaignId = form.campaign_id ?? null;
  const rollAttribute = (label: string, target: number) =>
    roll({ label: `${label} check`, target, characterId: id, campaignId });

  const gear = entries.filter((e) => e.kind === "equipment");
  const weaponEntries = gear.filter(
    (e) => ((e.data["weapons"] as unknown[] | undefined) ?? []).length > 0,
  );

  return (
    <div>
      <div className="screen-only">
      <PageHeader
        title={form.name || "Untitled character"}

        description={form.concept ?? undefined}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const prev = document.title;
                document.title = form.name || "Untitled character";
                window.print();
                document.title = prev;
              }}
            >
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              aria-label="Copy image generation prompt"
              onClick={() => {
                const prompt = buildImagePrompt({
                  name: form.name,
                  concept: form.concept,
                  techLevel: form.tech_level,
                  appearance,
                  traits: entries
                    .filter((e) => TRAIT_KINDS.includes(e.kind))
                    .map((e) => e.name),
                  gear: gear.map((e) => e.name),
                });
                void navigator.clipboard
                  .writeText(prompt)
                  .then(() => toast.success("Image prompt copied to clipboard."))
                  .catch(() => toast.error("Could not copy the prompt."));
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" /> Prompt
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(
                  `${slugify(form.name)}.json`,
                  JSON.stringify(toPortable(toCharacterRecord(form), entries), null, 2),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> JSON
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(`${slugify(form.name)}.csv`, entriesToCsv(entries, sheet), "text/csv")
              }
            >
              CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => clone.mutate()}
              disabled={clone.isPending}
            >
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </Button>
            <Button onClick={() => snapshot.mutate()} disabled={snapshot.isPending}>
              <Save className="mr-2 h-4 w-4" /> Save version
            </Button>
            <span
              aria-live="polite"
              className="text-xs text-muted-foreground"
            >
              {save.isPending ? "Saving…" : saveError ? "Not saved" : "All changes saved"}
            </span>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <PointsBar sheet={sheet} budget={form.point_budget} />
        <div className="panel grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          {[
            ["HP", sheet.stats.hp],
            ["Will", sheet.stats.will],
            ["Per", sheet.stats.per],
            ["FP", sheet.stats.fp],
            ["Speed", sheet.stats.basicSpeed.toFixed(2)],
            ["Move", sheet.encumbrance.effectiveMove],
            ["Dodge", sheet.encumbrance.effectiveDodge],
            ["BL", sheet.stats.basicLift],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-border bg-muted/20 p-2 text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="stat-value text-lg">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="attributes">
        <TabsList className="no-print flex-wrap">
          <TabsTrigger value="attributes">Attributes</TabsTrigger>
          <TabsTrigger value="traits">Traits</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="combat">Combat</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Attributes */}
        <TabsContent value="attributes" className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="panel space-y-4 p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Identity
            </h2>
            <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
              <div className="space-y-4">
                <PortraitPanel
                  characterId={id}
                  name={form.name}
                  path={form.portrait_path}
                  onChange={(p) => patch({ portrait_path: p })}
                />
                <ModelPanel
                  characterId={id}
                  name={form.name}
                  path={form.model_path ?? null}
                  onChange={(p) => patch({ model_path: p })}
                  transform={parseModelTransform(form.model_transform)}
                  onTransformChange={(t) => patch({ model_transform: t })}
                />

              </div>

              <div className="grid gap-4 sm:grid-cols-2">

              <Field label="Name">
                <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field label="Player">
                <Input
                  value={form.player_name ?? ""}
                  onChange={(e) => patch({ player_name: e.target.value })}
                />
              </Field>
              <Field label="Concept" className="sm:col-span-2">
                <Input
                  value={form.concept ?? ""}
                  onChange={(e) => patch({ concept: e.target.value })}
                />
              </Field>
              <Field label="Point budget">
                <Input
                  type="number"
                  value={form.point_budget}
                  onChange={(e) => patch({ point_budget: Number(e.target.value) })}
                />
              </Field>
              <Field label="Tech level">
                <Input
                  type="number"
                  value={form.tech_level}
                  onChange={(e) => patch({ tech_level: Number(e.target.value) })}
                />
              </Field>
              <Field label="Wealth">
                <Input value={form.wealth} onChange={(e) => patch({ wealth: e.target.value })} />
              </Field>
              <Field label="Status">
                <Input
                  type="number"
                  value={form.status}
                  onChange={(e) => patch({ status: Number(e.target.value) })}
                />
              </Field>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label>Treat as NPC</Label>
                <p className="text-xs text-muted-foreground">NPCs appear separately on GM tools.</p>
              </div>
              <Switch checked={form.is_npc} onCheckedChange={(v) => patch({ is_npc: v })} />
            </div>
            <CharacterPacksPanel
              packs={linkedPacks}
              lockedPacks={campaignPacks}
              onChange={(next) => patch({ packs: next })}
            />
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Appearance &amp; background
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {APPEARANCE_FIELDS.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Input
                      value={String(appearance[key] ?? "")}
                      onChange={(e) => patch({ appearance: { ...appearance, [key]: e.target.value } as never })}
                    />
                  </Field>
                ))}
              </div>
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Attributes
            </h2>
            <div className="grid gap-4 sm:grid-cols-4">
              {(
                [
                  ["ST", "st"],
                  ["DX", "dx"],
                  ["IQ", "iq"],
                  ["HT", "ht"],
                ] as const
              ).map(([label, key]) => (
                <Field key={key} label={label}>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={form[key]}
                      onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<CharacterRow>)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Roll ${label}`}
                      title={`Roll against ${label} ${sheet.stats[key]}`}
                      onClick={() => rollAttribute(label, sheet.stats[key])}
                    >
                      <Dices className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["Will", sheet.stats.will],
                  ["Per", sheet.stats.per],
                  ["HT (FP)", sheet.stats.ht],
                ] as const
              ).map(([label, value]) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => rollAttribute(label, value)}
                >
                  <Dices className="mr-1 h-4 w-4" /> {label} {value}
                </Button>
              ))}
            </div>

            <h3 className="pt-2 font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Secondary adjustments
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["HP", "hp_delta"],
                  ["Will", "will_delta"],
                  ["Per", "per_delta"],
                  ["FP", "fp_delta"],
                  ["Basic Speed", "speed_delta"],
                  ["Basic Move", "move_delta"],
                ] as const
              ).map(([label, key]) => (
                <Field key={key} label={label}>
                  <Input
                    type="number"
                    step={key === "speed_delta" ? "0.25" : "1"}
                    value={form[key]}
                    onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<CharacterRow>)}
                  />
                </Field>
              ))}
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              {sheet.damage.status === "configured" ? (
                <>
                  Basic damage ({sheet.damage.source}): thrust{" "}
                  <span className="stat-value text-foreground">{sheet.damage.thrust}</span>, swing{" "}
                  <span className="stat-value text-foreground">{sheet.damage.swing}</span>
                </>
              ) : (
                <>
                  Basic damage: <span className="text-foreground">not configured</span>. No damage
                  progression is installed, so thrust and swing are unavailable for this ST. Add a
                  progression through a content pack or campaign house rules.
                </>
              )}
            </div>
          </section>
        </TabsContent>

        {/* Traits */}
        <TabsContent value="traits" className="mt-6 space-y-6">
          {[...TRAIT_KINDS, ...LORE_KINDS].map((kind) => (
            <EntryGroup
              key={kind}
              title={`${kind}s`}
              kind={kind}
              entries={entries.filter((e) => e.kind === kind)}
              onAdd={() => openNew(kind)}
              onAddFromPack={() => setPickerKinds([kind])}
              onEdit={openEdit}
              onDelete={(eid) => removeEntry.mutate(eid)}
            />
          ))}
        </TabsContent>

        {/* Skills */}
        <TabsContent value="skills" className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setPickerKinds(["skill"])}>
              <Plus className="mr-1 h-4 w-4" /> Skills from packs
            </Button>
            <Button size="sm" onClick={() => setPickerKinds(["technique"])}>
              <Plus className="mr-1 h-4 w-4" /> Techniques from packs
            </Button>
            <Button size="sm" onClick={() => setPickerKinds(["spell"])}>
              <Plus className="mr-1 h-4 w-4" /> Spells from packs
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNew("skill")}>
              <Plus className="mr-1 h-4 w-4" /> Custom skill
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNew("technique")}>
              <Plus className="mr-1 h-4 w-4" /> Custom technique
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNew("spell")}>
              <Plus className="mr-1 h-4 w-4" /> Custom spell / ability
            </Button>
          </div>
          <div className="panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Kind</TableHead>
                  <TableHead className="w-24 text-right">Relative</TableHead>
                  <TableHead className="w-20 text-right">Points</TableHead>
                  <TableHead className="w-24 text-right">Level</TableHead>
                   <TableHead className="w-64 text-right">Roll result</TableHead>
                   <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.skills.length === 0 ? (
                  <TableRow>
                     <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No skills yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sheet.skills.map(({ entry, level }) => {
                    const rollKey = `skill:${id}:${entry.id}`;
                    const latestRoll = history.find((event) => event.contextKey === rollKey);
                    const passed = latestRoll?.outcome?.includes("success") ?? false;
                    return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.name}
                        {entry.data["specialization"] ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({String(entry.data["specialization"])})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.kind}
                        {isCustomEntry(entry.source) ? (
                          <Badge variant="outline" className="ml-1">custom</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono">{level.label}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(entry.data["points"] ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {level.effective ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-[180px] flex-wrap items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={level.effective === null}
                          onClick={() =>
                            roll({
                              label: `${entry.name} skill check`,
                              target: level.effective,
                              characterId: id,
                              contextKey: rollKey,
                              campaignId,
                            })
                          }
                        >
                          <Dices className="mr-1 h-4 w-4" /> Roll
                        </Button>
                        {latestRoll ? (
                          <Badge variant={passed ? "default" : "destructive"}>
                            {latestRoll.outcome?.startsWith("critical") ? "Critical " : ""}
                            {passed ? "pass" : "failure"}
                            {latestRoll.margin !== null
                              ? ` by ${Math.abs(latestRoll.margin)}`
                              : ""}
                          </Badge>
                        ) : level.effective === null ? (
                          <span className="text-xs text-muted-foreground">Not configured</span>
                        ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          onEdit={() => openEdit(entry)}
                          onDelete={() => removeEntry.mutate(entry.id)}
                        />
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Equipment */}
        <TabsContent value="equipment" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => setPickerKinds(["equipment"])}>
              <Plus className="mr-1 h-4 w-4" /> Add from packs
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNew("equipment")}>
              <Plus className="mr-1 h-4 w-4" /> Custom item
            </Button>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span>
                Carried <span className="stat-value text-foreground">{sheet.encumbrance.carriedWeight}</span>
              </span>
              <span>
                Total <span className="stat-value text-foreground">{sheet.encumbrance.totalWeight}</span>
              </span>
              <span>
                Value <span className="stat-value text-foreground">{sheet.encumbrance.totalCost}</span>
              </span>
              <Badge variant="outline">
                {sheet.encumbrance.label} · Move {sheet.encumbrance.effectiveMove} · Dodge{" "}
                {sheet.encumbrance.effectiveDodge}
              </Badge>
            </div>
          </div>
          <div className="panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-16 text-right">Qty</TableHead>
                  <TableHead className="w-20 text-right">Weight</TableHead>
                  <TableHead className="w-20 text-right">Cost</TableHead>
                  <TableHead className="hidden w-16 text-right md:table-cell">DR</TableHead>
                  <TableHead className="w-24">State</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {gear.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No equipment yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  gear.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(e.data["quantity"] ?? 1)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(e.data["weight"] ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(e.data["cost"] ?? 0)}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono md:table-cell">
                        {Number(e.data["dr"] ?? 0) || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.data["carried"] === false ? "outline" : "default"}>
                          {e.data["carried"] === false ? "Stored" : "Carried"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          onEdit={() => openEdit(e)}
                          onDelete={() => removeEntry.mutate(e.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Combat */}
        <TabsContent value="combat" className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="space-y-4">
            <div className="panel space-y-4 p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Condition
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label={`Current HP / ${sheet.stats.hp}`}>
                  <Input
                    type="number"
                    value={form.current_hp ?? sheet.stats.hp}
                    onChange={(e) => patch({ current_hp: Number(e.target.value) })}
                  />
                </Field>
                <Field label={`Current FP / ${sheet.stats.fp}`}>
                  <Input
                    type="number"
                    value={form.current_fp ?? sheet.stats.fp}
                    onChange={(e) => patch({ current_fp: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <div className="space-y-2">
                <Label>Conditions</Label>
                <div className="flex flex-wrap gap-1">
                  {form.conditions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None active.</p>
                  ) : (
                    form.conditions.map((c) => (
                      <Badge key={c} variant="outline" className="gap-1">
                        {c}
                        <button
                          type="button"
                          aria-label={`Remove ${c}`}
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            patch({ conditions: form.conditions.filter((x) => x !== c) })
                          }
                        >
                          ×
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = conditionInput.trim();
                    if (!value || form.conditions.includes(value)) return;
                    patch({ conditions: [...form.conditions, value] });
                    setConditionInput("");
                  }}
                >
                  <Input
                    value={conditionInput}
                    placeholder="Add a condition…"
                    onChange={(e) => setConditionInput(e.target.value)}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Add
                  </Button>
                </form>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Mini label="Move" value={sheet.encumbrance.effectiveMove} />
                <Mini label="Dodge" value={sheet.encumbrance.effectiveDodge} />
                <Mini label="Load" value={sheet.encumbrance.label} />
              </div>
            </div>

            <div className="panel p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                DR by location
              </h2>
              {Object.keys(sheet.dr).length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No worn armour.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {Object.entries(sheet.dr).map(([loc, dr]) => (
                    <Mini key={loc} label={loc} value={dr} />
                  ))}
                </div>
              )}
            </div>

            <div className="panel p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Quick rolls
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    ["ST", sheet.stats.st],
                    ["DX", sheet.stats.dx],
                    ["IQ", sheet.stats.iq],
                    ["HT", sheet.stats.ht],
                    ["Will", sheet.stats.will],
                    ["Per", sheet.stats.per],
                  ] as const
                ).map(([label, value]) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="sm"
                    onClick={() => rollAttribute(label, value)}
                  >
                    {label} {value}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Attacks
            </h2>
            {weaponEntries.length === 0 ? (
              <div className="panel p-8 text-center text-sm text-muted-foreground">
                Add an equipment item with attack modes to see it here.
              </div>
            ) : (
              weaponEntries.map((e) => {
                const modes = ((e.data["weapons"] ?? []) as unknown as WeaponMode[]);
                return (
                  <div key={e.id} className="panel p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{e.name}</p>
                      <RowActions onEdit={() => openEdit(e)} onDelete={() => removeEntry.mutate(e.id)} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {modes.map((m, i) => {
                        const persisted = currentShotsFor(
                          toWeaponStateMap(weaponStateQuery.data ?? []),
                          e.id!,
                          i,
                        );
                        const weapon = normalizeWeaponMode(m, {
                          st: sheet.stats.st,
                          ...(persisted === undefined ? {} : { currentShots: persisted }),
                        });
                        const skill = sheet.skills.find(
                          (s) => s.entry.name.toLowerCase() === (weapon.skill ?? "").toLowerCase(),
                        );
                        const target = skill?.level.effective ?? sheet.stats.dx;
                        return (
                          <AttackModeCard
                            key={`${i}:${persisted ?? "none"}`}
                            weapon={weapon}
                            target={target}
                            onAttack={() =>
                              roll({
                                label: `${e.name} — ${weapon.name}`,
                                target,
                                characterId: id,
                                campaignId,
                              })
                            }
                            onDamage={(expression) =>
                              roll({
                                label: `${e.name} damage`,
                                expression,
                                characterId: id,
                                campaignId,
                              })
                            }
                            persistAmmo={async (current) => {
                              await upsertWeaponState({
                                characterId: id,
                                entryId: e.id!,
                                modeKey: attackModeKey(i),
                                currentShots: current,
                              });
                              await queryClient.invalidateQueries({
                                queryKey: ["weapon-state", id],
                              });
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </TabsContent>

        {/* Notes */}
        <TabsContent value="notes" className="mt-6">
          <div className="panel max-w-3xl p-5">
            <Field label="Character notes">
              <Textarea
                rows={14}
                value={form.notes ?? ""}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </Field>
          </div>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-6">
          <div className="panel divide-y divide-border">
            {versionsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : versionsQuery.data?.length ? (
              versionsQuery.data.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{v.label || "Snapshot"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setPendingRestore(v)}>
                    Restore
                  </Button>
                </div>
              ))
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                No versions saved yet. Use “Save version” to snapshot the sheet before big changes.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!pendingRestore} onOpenChange={(v) => !v && setPendingRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              The sheet is replaced with the saved snapshot. Ownership and campaign links are kept.
              Save a version first if you want to keep the current state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRestore) restore.mutate(pendingRestore);
                setPendingRestore(null);
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        onChange={setDraft}
        onSubmit={() => upsertEntry.mutate(draft)}
      />

      <PackPickerDialog
        open={pickerKinds !== null}
        onOpenChange={(v) => !v && setPickerKinds(null)}
        kinds={pickerKinds ?? []}
        packs={effectivePacks}
        pending={addFromPack.isPending}
        onAdd={(entry) => addFromPack.mutate(entry)}
      />
      </div>

      <PrintSheet
        character={form}
        sheet={sheet}
        entries={entries}
        portraitUrl={printPortraitUrl}
      />
    </div>

  );
}

function EntryGroup({
  title,
  kind,
  entries,
  onAdd,
  onAddFromPack,
  onEdit,
  onDelete,
}: {
  title: string;
  kind: EntryKind;
  entries: CharacterEntry[];
  onAdd: () => void;
  onAddFromPack?: () => void;
  onEdit: (e: CharacterEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [descFor, setDescFor] = useState<CharacterEntry | null>(null);

  const descParts = (e: CharacterEntry) => {
    const mods = (e.data["modifiers"] as { name: string; percent: number }[] | undefined) ?? [];
    return [
      isCustomEntry(e.source)
        ? "custom"
        : String((e.source as Record<string, unknown>)["pack"] ?? ""),
      e.category,
      ...mods.map((m) => `${m.name} ${m.percent > 0 ? "+" : ""}${m.percent}%`),
    ].filter(Boolean);
  };

  return (
    <section className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <div className="flex flex-wrap gap-2">
          {onAddFromPack ? (
            <Button size="sm" onClick={onAddFromPack}>
              <Plus className="mr-1 h-4 w-4" /> From packs
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" /> Custom {kind}
          </Button>
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {entries.map((e) => {
            const parts = descParts(e);
            const hasDesc = parts.length > 0 || !!e.notes;
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {e.name}
                    {e.levels > 1 ? ` ${e.levels}` : ""}
                    {hasDesc ? (
                      <button
                        type="button"
                        className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground"
                        aria-label="Show description"
                        onClick={() => setDescFor(e)}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </p>
                </div>
                <span className="stat-value text-sm">{e.points * Math.max(1, e.levels)}</span>
                <RowActions onEdit={() => onEdit(e)} onDelete={() => onDelete(e.id)} />
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!descFor} onOpenChange={(v) => !v && setDescFor(null)}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{descFor?.name}</DialogTitle>
            <DialogDescription>
              {descFor ? descParts(descFor).join(" · ") : ""}
            </DialogDescription>
          </DialogHeader>
          {descFor?.notes ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">{descFor.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No additional description.</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="no-print flex shrink-0">
      <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {child}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="stat-value text-sm">{value}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {label} <span className="font-mono text-foreground">{value}</span>
    </span>
  );
}
