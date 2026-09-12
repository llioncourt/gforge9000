import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  History,
  Pencil,
  Plus,
  Printer,
  Save,
  Trash2,
} from "lucide-react";
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
  toCharacterRecord,
  toEntry,
  updateCharacter,
  updateEntry,
  type CharacterRow,
} from "@/lib/api";
import { buildSheet, type CharacterEntry, type EntryKind } from "@/rules";
import { useDice } from "@/components/app/dice-context";
import { PointsBar } from "@/components/character/stat-bar";
import {
  EntryDialog,
  emptyDraft,
  toDraft,
  type EntryDraft,
} from "@/components/character/entry-dialog";
import { download, entriesToCsv, slugify, toPortable } from "@/lib/portable";

export const Route = createFileRoute("/_authenticated/characters/$id")({
  head: () => ({
    meta: [
      { title: "Character sheet — Universal Character Forge" },
      {
        name: "description",
        content:
          "Live point totals, traits, skills, equipment, encumbrance and a rollable combat sheet.",
      },
      { property: "og:title", content: "Character sheet — Universal Character Forge" },
      { property: "og:description", content: "Live point totals and a rollable combat sheet." },
    ],
  }),
  component: CharacterPage,
});

const TRAIT_KINDS: EntryKind[] = ["advantage", "disadvantage", "perk", "quirk", "custom"];
const LORE_KINDS: EntryKind[] = ["language", "culture"];

function CharacterPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { roll } = useDice();

  const characterQuery = useQuery({ queryKey: ["character", id], queryFn: () => getCharacter(id) });
  const entriesQuery = useQuery({ queryKey: ["entries", id], queryFn: () => listEntries(id) });
  const versionsQuery = useQuery({ queryKey: ["versions", id], queryFn: () => listVersions(id) });

  const [form, setForm] = useState<CharacterRow | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (characterQuery.data && !dirty.current) setForm(characterQuery.data);
  }, [characterQuery.data]);

  const save = useMutation({
    mutationFn: (patch: Partial<CharacterRow>) => updateCharacter(id, patch),
    onSuccess: () => {
      dirty.current = false;
      queryClient.invalidateQueries({ queryKey: ["characters"] });
    },
    onError: (e: Error) => toast.error(e.message),
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

  function openNew(kind: EntryKind) {
    setDraft(emptyDraft(kind));
    setDialogOpen(true);
  }
  function openEdit(entry: CharacterEntry) {
    setDraft(toDraft(entry));
    setDialogOpen(true);
  }

  if (!form || !sheet) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  const gear = entries.filter((e) => e.kind === "equipment");
  const weaponEntries = gear.filter(
    (e) => ((e.data["weapons"] as unknown[] | undefined) ?? []).length > 0,
  );

  return (
    <div>
      <PageHeader
        title={form.name || "Untitled character"}
        description={form.concept ?? undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(
                  `${slugify(form.name)}.json`,
                  JSON.stringify(toPortable(form, entriesQuery.data ?? []), null, 2),
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
            <Button onClick={() => snapshot.mutate()} disabled={snapshot.isPending}>
              <Save className="mr-2 h-4 w-4" /> Save version
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <PointsBar sheet={sheet} budget={form.point_budget} />
        <div className="panel grid grid-cols-4 gap-2 p-4">
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
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label>Treat as NPC</Label>
                <p className="text-xs text-muted-foreground">NPCs appear separately on GM tools.</p>
              </div>
              <Switch checked={form.is_npc} onCheckedChange={(v) => patch({ is_npc: v })} />
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
                  <Input
                    type="number"
                    value={form[key]}
                    onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<CharacterRow>)}
                  />
                </Field>
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
              Basic damage (generic formula): thrust{" "}
              <span className="stat-value text-foreground">{sheet.damage.thrust}</span>, swing{" "}
              <span className="stat-value text-foreground">{sheet.damage.swing}</span>
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
              onEdit={openEdit}
              onDelete={(eid) => removeEntry.mutate(eid)}
            />
          ))}
        </TabsContent>

        {/* Skills */}
        <TabsContent value="skills" className="mt-6 space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => openNew("skill")}>
              <Plus className="mr-1 h-4 w-4" /> Skill
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNew("technique")}>
              <Plus className="mr-1 h-4 w-4" /> Technique
            </Button>
            <Button size="sm" variant="outline" onClick={() => openNew("spell")}>
              <Plus className="mr-1 h-4 w-4" /> Spell / ability
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
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheet.skills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No skills yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sheet.skills.map(({ entry, level }) => (
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
                      <TableCell className="text-muted-foreground">{entry.kind}</TableCell>
                      <TableCell className="text-right font-mono">{level.label}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(entry.data["points"] ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="stat-value"
                          onClick={() =>
                            roll({
                              label: `${entry.name}`,
                              target: level.effective ?? 10,
                              characterId: id,
                            })
                          }
                        >
                          {level.effective ?? "—"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          onEdit={() => openEdit(entry)}
                          onDelete={() => removeEntry.mutate(entry.id)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Equipment */}
        <TabsContent value="equipment" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => openNew("equipment")}>
              <Plus className="mr-1 h-4 w-4" /> Add item
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
              <Field label="Conditions (comma separated)">
                <Input
                  value={form.conditions.join(", ")}
                  onChange={(e) =>
                    patch({
                      conditions: e.target.value
                        .split(",")
                        .map((c) => c.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
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
                    onClick={() => roll({ label: `${label} check`, target: value, characterId: id })}
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
                const modes = (e.data["weapons"] as Record<string, string>[]) ?? [];
                return (
                  <div key={e.id} className="panel p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{e.name}</p>
                      <RowActions onEdit={() => openEdit(e)} onDelete={() => removeEntry.mutate(e.id)} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {modes.map((m, i) => {
                        const skill = sheet.skills.find(
                          (s) => s.entry.name.toLowerCase() === String(m["skill"] ?? "").toLowerCase(),
                        );
                        const target = skill?.level.effective ?? sheet.stats.dx;
                        return (
                          <div
                            key={i}
                            className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm"
                          >
                            <span className="font-medium">{m["name"]}</span>
                            <span className="font-mono text-muted-foreground">{m["damage"]}</span>
                            {m["reach"] ? <Meta label="Reach" value={m["reach"]} /> : null}
                            {m["parry"] ? <Meta label="Parry" value={m["parry"]} /> : null}
                            {m["accuracy"] ? <Meta label="Acc" value={m["accuracy"]} /> : null}
                            {m["range"] ? <Meta label="Range" value={m["range"]} /> : null}
                            {m["rof"] ? <Meta label="RoF" value={m["rof"]} /> : null}
                            {m["shots"] ? <Meta label="Shots" value={m["shots"]} /> : null}
                            {m["bulk"] ? <Meta label="Bulk" value={m["bulk"]} /> : null}
                            {m["recoil"] ? <Meta label="Rcl" value={m["recoil"]} /> : null}
                            <div className="ml-auto flex gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  roll({
                                    label: `${e.name} — ${m["name"]}`,
                                    target,
                                    characterId: id,
                                  })
                                }
                              >
                                Attack {target}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  roll({
                                    label: `${e.name} damage`,
                                    expression: String(m["damage"] ?? "1d6"),
                                    characterId: id,
                                  })
                                }
                              >
                                Damage
                              </Button>
                            </div>
                          </div>
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
                  <Button size="sm" variant="outline" onClick={() => restore.mutate(v)}>
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

      <EntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        onChange={setDraft}
        onSubmit={() => upsertEntry.mutate(draft)}
      />
    </div>
  );
}

function EntryGroup({
  title,
  kind,
  entries,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  kind: EntryKind;
  entries: CharacterEntry[];
  onAdd: () => void;
  onEdit: (e: CharacterEntry) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add {kind}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {entries.map((e) => {
            const mods = (e.data["modifiers"] as { name: string; percent: number }[] | undefined) ?? [];
            return (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {e.name}
                    {e.levels > 1 ? ` ${e.levels}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[e.category, ...mods.map((m) => `${m.name} ${m.percent > 0 ? "+" : ""}${m.percent}%`)]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <span className="stat-value text-sm">{e.points * Math.max(1, e.levels)}</span>
                <RowActions onEdit={() => onEdit(e)} onDelete={() => onDelete(e.id)} />
              </li>
            );
          })}
        </ul>
      )}
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
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
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
