import * as React from "react";
import { useTransferTask } from "@/components/ui/transfer-dialog";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
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
import { Trans } from "react-i18next";
import { useT } from "@/i18n/hooks";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { rulesetFromSettings } from "@/rules/campaign-ruleset";
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
import { metaText } from "@/i18n/meta";

import { PrintSheet } from "@/components/character/print-sheet";

export const Route = createFileRoute("/_authenticated/characters/$id")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { from?: string } => {
    const from = search["from"];
    return typeof from === "string" && from ? { from } : {};
  },
  head: ({ params }) => {
    const title = metaText("characters", "meta.sheetTitle", { id: params.id.slice(0, 8) });
    const description = metaText("characters", "meta.sheetDescription");
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

/**
 * Where the "back" control returns to. Callers pass `from`:
 *   `campaign:<id>[:<tab>]` — opened from a campaign page
 *   `entity:<id>`           — opened from a lore entry's linked character sheet
 * Anything else returns to the characters list.
 */
type BackTo =
  | { kind: "characters" }
  | { kind: "campaign"; id: string; tab?: string | undefined }
  | { kind: "entity"; id: string };

function parseBack(from?: string): BackTo {
  if (from?.startsWith("campaign:")) {
    const [, id, tab] = from.split(":");
    if (id) return { kind: "campaign", id, tab };
  }
  if (from?.startsWith("entity:")) {
    const id = from.slice("entity:".length);
    if (id) return { kind: "entity", id };
  }
  return { kind: "characters" };
}

function BackLink({ from }: { from?: string | undefined }) {
  const { t } = useT("characters");
  const back = parseBack(from);
  const cls =
    "no-print mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground";

  if (back.kind === "campaign") {
    const search = back.tab ? { tab: back.tab as never } : {};
    return (
      <Link to="/campaigns/$id" params={{ id: back.id }} search={search} className={cls}>
        <ArrowLeft className="h-4 w-4" /> {t("back.campaign")}
      </Link>
    );
  }
  if (back.kind === "entity") {
    return (
      <Link to="/entities/$id" params={{ id: back.id }} className={cls}>
        <ArrowLeft className="h-4 w-4" /> {t("back.loreEntry")}
      </Link>
    );
  }
  return (
    <Link to="/characters" className={cls}>
      <ArrowLeft className="h-4 w-4" /> {t("back.allCharacters")}
    </Link>
  );
}

/** Icon-only "+" control; its meaning lives in the tooltip and accessible name. */
function PlusButton({
  label,
  onClick,
  variant = "default",
  disabled,
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost" | undefined;
  disabled?: boolean | undefined;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant={variant}
          className="h-8 w-8"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const TRAIT_KINDS: EntryKind[] = ["advantage", "disadvantage", "perk", "quirk", "custom"];
const LORE_KINDS: EntryKind[] = ["language", "culture"];
const APPEARANCE_FIELDS = [
  "age",
  "height",
  "weight",
  "build",
  "hair",
  "eyes",
  "handedness",
  "languages_note",
] as const;

function CharacterPage() {
  const { t } = useT("characters");
  const { t: tc } = useT("common");
  const { id } = Route.useParams();
  const { from } = Route.useSearch();
  const queryClient = useQueryClient();
  const { roll, history } = useDice();

  const characterQuery = useQuery({ queryKey: ["character", id], queryFn: () => getCharacter(id) });

  useEffect(() => {
    const name = characterQuery.data?.name;
    if (name) document.title = `${name} — Universal Character Forge`;
  }, [characterQuery.data?.name]);

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
  const [pendingEntryDelete, setPendingEntryDelete] = useState<string | null>(null);

  const dirty = useRef(false);
  const exportTask = useTransferTask();
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
  // When the character belongs to a campaign, the campaign's enabled packs are
  // automatically available on the sheet (unioned with the character's own).
  const campaignQuery = useQuery({
    queryKey: ["campaign", form?.campaign_id],
    queryFn: () => getCampaign(form!.campaign_id!),
    enabled: !!form?.campaign_id,
  });
  const campaignRuleset = useMemo(
    () => rulesetFromSettings(campaignQuery.data?.settings),
    [campaignQuery.data],
  );
  const sheet = useMemo(
    () => (form ? buildSheet(toCharacterRecord(form), entries, campaignRuleset) : null),
    [form, entries, campaignRuleset],
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
      toast.success(t("sheet.entrySaved"));
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
      toast.success(t("sheet.versionSaved"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: restoreVersion,
    onSuccess: () => {
      dirty.current = false;
      queryClient.invalidateQueries();
      toast.success(t("sheet.versionRestored"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clone = useMutation({
    mutationFn: () => duplicateCharacter(id),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      toast.success(t("sheet.duplicated", { name: copy.name }));
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
      toast.success(t("sheet.addedFromPack"));
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
    roll({ label: t("sheet.rollLabels.attributeCheck", { label }), target, characterId: id, campaignId });

  const gear = entries.filter((e) => e.kind === "equipment");
  const weaponEntries = gear.filter(
    (e) => ((e.data["weapons"] as unknown[] | undefined) ?? []).length > 0,
  );

  return (
    <div>
      <div className="screen-only">
        <BackLink from={from} />
        <PageHeader
          title={form.name || t("sheet.untitled")}

          description={form.concept ?? undefined}
          actions={
            <div className="no-print flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const prev = document.title;
                  document.title = form.name || t("sheet.untitled");
                  window.print();
                  document.title = prev;
                }}
              >
                <Printer className="mr-2 h-4 w-4" /> {tc("actions.print")}
              </Button>
              <Button
                variant="outline"
                aria-label={t("sheet.promptAria")}
                onClick={() => {
                  const prompt = buildImagePrompt({
                    name: form.name,
                    concept: form.concept,
                    techLevel: form.tech_level,
                    appearance,
                    traits: entries.filter((e) => TRAIT_KINDS.includes(e.kind)).map((e) => e.name),
                    gear: gear.map((e) => e.name),
                  });
                  void navigator.clipboard
                    .writeText(prompt)
                    .then(() => toast.success(t("sheet.promptCopied")))
                    .catch(() => toast.error(t("sheet.promptCopyFailed")));
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" /> {t("sheet.promptButton")}
              </Button>
              <Button
                variant="outline"
                disabled={exportTask.busy}
                onClick={() =>
                  void exportTask.run(t("sheet.exportingJson"), async (report) => {
                    report(t("sheet.buildingFile"), 40);
                    const contents = JSON.stringify(
                      toPortable(toCharacterRecord(form), entries),
                      null,
                      2,
                    );
                    report(t("sheet.downloading"), 85);
                    download(`${slugify(form.name)}.json`, contents);
                    return t("sheet.exportedJson", { name: form.name, count: entries.length });
                  })
                }
              >
                <Download className="mr-2 h-4 w-4" /> {t("sheet.exportJson")}
              </Button>
              <Button
                variant="outline"
                disabled={exportTask.busy}
                onClick={() =>
                  void exportTask.run(t("sheet.exportingCsv"), async (report) => {
                    report(t("sheet.buildingFile"), 40);
                    const contents = entriesToCsv(entries, sheet);
                    report(t("sheet.downloading"), 85);
                    download(`${slugify(form.name)}.csv`, contents, "text/csv");
                    return t("sheet.exportedCsv", { count: entries.length });
                  })
                }
              >
                {t("sheet.exportCsv")}
              </Button>
              <Button variant="outline" onClick={() => clone.mutate()} disabled={clone.isPending}>
                <Copy className="mr-2 h-4 w-4" /> {t("sheet.duplicate")}
              </Button>
              <Button onClick={() => snapshot.mutate()} disabled={snapshot.isPending}>
                <Save className="mr-2 h-4 w-4" /> {t("sheet.saveVersion")}
              </Button>
              <span aria-live="polite" className="text-xs text-muted-foreground">
                {save.isPending ? t("sheet.saving") : saveError ? t("sheet.notSaved") : t("sheet.allSaved")}
              </span>
            </div>
          }
        />

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <PointsBar sheet={sheet} budget={form.point_budget} />
          <div className="panel grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            {[
              [t("sheet.stats.hp"), sheet.stats.hp],
              [t("sheet.stats.will"), sheet.stats.will],
              [t("sheet.stats.per"), sheet.stats.per],
              [t("sheet.stats.fp"), sheet.stats.fp],
              [t("sheet.stats.speed"), sheet.stats.basicSpeed.toFixed(2)],
              [t("sheet.stats.move"), sheet.encumbrance.effectiveMove],
              [t("sheet.stats.dodge"), sheet.encumbrance.effectiveDodge],
              [t("sheet.stats.bl"), sheet.stats.basicLift],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-md border border-border bg-muted/20 p-2 text-center"
              >
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {label}
                </p>
                <p className="stat-value text-lg">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <Tabs defaultValue="attributes">
          <TabsList className="no-print flex-wrap">
            <TabsTrigger value="attributes">{t("sheet.tabs.attributes")}</TabsTrigger>
            <TabsTrigger value="traits">{t("sheet.tabs.traits")}</TabsTrigger>
            <TabsTrigger value="skills">{t("sheet.tabs.skills")}</TabsTrigger>
            <TabsTrigger value="equipment">{t("sheet.tabs.equipment")}</TabsTrigger>
            <TabsTrigger value="combat">{t("sheet.tabs.combat")}</TabsTrigger>
            <TabsTrigger value="notes">{t("sheet.tabs.notes")}</TabsTrigger>
            <TabsTrigger value="history">{t("sheet.tabs.history")}</TabsTrigger>
          </TabsList>

          {/* Attributes */}
          <TabsContent value="attributes" className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="panel space-y-4 p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {t("sheet.identity.title")}
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
                  <Field label={t("sheet.identity.name")}>
                    <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} />
                  </Field>
                  <Field label={t("sheet.identity.player")}>
                    <Input
                      value={form.player_name ?? ""}
                      onChange={(e) => patch({ player_name: e.target.value })}
                    />
                  </Field>
                  <Field label={t("sheet.identity.concept")} className="sm:col-span-2">
                    <Input
                      value={form.concept ?? ""}
                      onChange={(e) => patch({ concept: e.target.value })}
                    />
                  </Field>
                  <Field label={t("sheet.identity.pointBudget")}>
                    <Input
                      type="number"
                      value={form.point_budget}
                      onChange={(e) => patch({ point_budget: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={t("sheet.identity.techLevel")}>
                    <Input
                      type="number"
                      value={form.tech_level}
                      onChange={(e) => patch({ tech_level: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={t("sheet.identity.wealth")}>
                    <Input
                      value={form.wealth}
                      onChange={(e) => patch({ wealth: e.target.value })}
                    />
                  </Field>
                  <Field label={t("sheet.identity.status")}>
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
                  <Label>{t("sheet.identity.npcLabel")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("sheet.identity.npcHint")}
                  </p>
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
                  {t("sheet.identity.appearanceTitle")}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {APPEARANCE_FIELDS.map((key) => (
                    <Field key={key} label={t(`sheet.identity.appearance.${key}`)}>
                      <Input
                        value={String(appearance[key] ?? "")}
                        onChange={(e) =>
                          patch({ appearance: { ...appearance, [key]: e.target.value } as never })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel space-y-4 p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {t("sheet.tabs.attributes")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-4">
                {(
                  [
                    ["st"],
                    ["dx"],
                    ["iq"],
                    ["ht"],
                  ] as const
                ).map(([key]) => {
                  const label = t(`sheet.stats.${key}`);
                  return (
                  <Field key={key} label={label}>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={form[key]}
                        onChange={(e) =>
                          patch({ [key]: Number(e.target.value) } as Partial<CharacterRow>)
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={t("sheet.attributes.rollAria", { label })}
                        title={t("sheet.attributes.rollTitle", { label, value: sheet.stats[key] })}
                        onClick={() => rollAttribute(label, sheet.stats[key])}
                      >
                        <Dices className="h-4 w-4" />
                      </Button>
                    </div>
                  </Field>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    [t("sheet.stats.will"), sheet.stats.will],
                    [t("sheet.stats.per"), sheet.stats.per],
                    [t("sheet.stats.htFp"), sheet.stats.ht],
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
                {t("sheet.attributes.secondaryTitle")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["hp", "hp_delta"],
                    ["will", "will_delta"],
                    ["per", "per_delta"],
                    ["fp", "fp_delta"],
                    ["basicSpeed", "speed_delta"],
                    ["basicMove", "move_delta"],
                  ] as const
                ).map(([statKey, key]) => (
                  <Field key={key} label={t(`sheet.stats.${statKey}`)}>
                    <Input
                      type="number"
                      step={key === "speed_delta" ? "0.25" : "1"}
                      value={form[key]}
                      onChange={(e) =>
                        patch({ [key]: Number(e.target.value) } as Partial<CharacterRow>)
                      }
                    />
                  </Field>
                ))}
              </div>
              <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                {sheet.damage.status === "configured" ? (
                  <Trans
                    t={t}
                    i18nKey="sheet.attributes.damageConfigured"
                    values={{ source: sheet.damage.source, thrust: sheet.damage.thrust, swing: sheet.damage.swing }}
                    components={{ 1: <span className="stat-value text-foreground" /> }}
                  />
                ) : (
                  <Trans t={t} i18nKey="sheet.attributes.damageUnconfigured" components={{ 1: <span className="text-foreground" /> }} />
                )}
              </div>
            </section>
          </TabsContent>

          {/* Traits */}
          <TabsContent value="traits" className="mt-6 space-y-6">
            {[...TRAIT_KINDS, ...LORE_KINDS].map((kind) => (
              <EntryGroup
                key={kind}
                title={t(`sheet.kindLabels.${kind}`)}
                kind={kind}
                entries={entries.filter((e) => e.kind === kind)}
                onAdd={() => openNew(kind)}
                onAddFromPack={() => setPickerKinds([kind])}
                onEdit={openEdit}
                onDelete={(eid) => setPendingEntryDelete(eid)}
              />
            ))}
          </TabsContent>

          {/* Skills */}
          <TabsContent value="skills" className="mt-6 space-y-6">
            <div className="flex flex-wrap gap-2">
              <PlusButton label={t("sheet.addFromPack.skill")} onClick={() => setPickerKinds(["skill"])} />
              <PlusButton
                label={t("sheet.addFromPack.technique")}
                onClick={() => setPickerKinds(["technique"])}
              />
              <PlusButton label={t("sheet.addFromPack.spell")} onClick={() => setPickerKinds(["spell"])} />
              <PlusButton
                label={t("sheet.addCustom.skill")}
                variant="outline"
                onClick={() => openNew("skill")}
              />
              <PlusButton
                label={t("sheet.addCustom.technique")}
                variant="outline"
                onClick={() => openNew("technique")}
              />
              <PlusButton
                label={t("sheet.addCustom.spell")}
                variant="outline"
                onClick={() => openNew("spell")}
              />
            </div>
            <div className="panel overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("sheet.skillsTable.name")}</TableHead>
                    <TableHead className="w-24">{t("sheet.skillsTable.kind")}</TableHead>
                    <TableHead className="w-24 text-right">{t("sheet.skillsTable.relative")}</TableHead>
                    <TableHead className="w-20 text-right">{t("sheet.skillsTable.points")}</TableHead>
                    <TableHead className="w-24 text-right">{t("sheet.skillsTable.level")}</TableHead>
                    <TableHead className="w-64 text-right">{t("sheet.skillsTable.rollResult")}</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheet.skills.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        {t("sheet.skillsTable.empty")}
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
                              <Badge variant="outline" className="ml-1">
                                {t("sheet.source.custom")}
                              </Badge>
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
                                    label: t("sheet.rollLabels.skillCheck", { name: entry.name }),
                                    target: level.effective,
                                    characterId: id,
                                    contextKey: rollKey,
                                    campaignId,
                                  })
                                }
                              >
                                <Dices className="mr-1 h-4 w-4" /> {t("sheet.actions.roll")}
                              </Button>
                              {latestRoll ? (
                                <Badge variant={passed ? "default" : "destructive"}>
                                  {latestRoll.margin !== null
                                    ? latestRoll.outcome?.startsWith("critical")
                                      ? passed
                                        ? t("sheet.rollOutcome.criticalPassMargin", { margin: Math.abs(latestRoll.margin) })
                                        : t("sheet.rollOutcome.criticalFailureMargin", { margin: Math.abs(latestRoll.margin) })
                                      : passed
                                        ? t("sheet.rollOutcome.passMargin", { margin: Math.abs(latestRoll.margin) })
                                        : t("sheet.rollOutcome.failureMargin", { margin: Math.abs(latestRoll.margin) })
                                    : latestRoll.outcome?.startsWith("critical")
                                      ? passed
                                        ? t("sheet.rollOutcome.criticalPass")
                                        : t("sheet.rollOutcome.criticalFailure")
                                      : passed
                                        ? t("sheet.rollOutcome.pass")
                                        : t("sheet.rollOutcome.failure")}
                                </Badge>
                              ) : level.effective === null ? (
                                <span className="text-xs text-muted-foreground">
                                  {t("sheet.skillsTable.notConfigured")}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <RowActions
                              onEdit={() => openEdit(entry)}
                              onDelete={() => setPendingEntryDelete(entry.id)}
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
              <PlusButton
                label={t("sheet.addFromPack.equipment")}
                onClick={() => setPickerKinds(["equipment"])}
              />
              <PlusButton
                label={t("sheet.addCustom.equipment")}
                variant="outline"
                onClick={() => openNew("equipment")}
              />
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>
                  {t("sheet.equipmentSummary.carried")}{" "}
                  <span className="stat-value text-foreground">
                    {sheet.encumbrance.carriedWeight}
                  </span>
                </span>
                <span>
                  {t("sheet.equipmentSummary.total")}{" "}
                  <span className="stat-value text-foreground">
                    {sheet.encumbrance.totalWeight}
                  </span>
                </span>
                <span>
                  {t("sheet.equipmentSummary.value")}{" "}
                  <span className="stat-value text-foreground">{sheet.encumbrance.totalCost}</span>
                </span>
                <Badge variant="outline">
                  {t("sheet.equipmentSummary.moveDodge", {
                    label: sheet.encumbrance.label,
                    move: sheet.encumbrance.effectiveMove,
                    dodge: sheet.encumbrance.effectiveDodge,
                  })}
                </Badge>
              </div>
            </div>
            <div className="panel overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("sheet.equipmentTable.item")}</TableHead>
                    <TableHead className="w-16 text-right">{t("sheet.equipmentTable.qty")}</TableHead>
                    <TableHead className="w-20 text-right">{t("sheet.equipmentTable.weight")}</TableHead>
                    <TableHead className="w-20 text-right">{t("sheet.equipmentTable.cost")}</TableHead>
                    <TableHead className="hidden w-16 text-right md:table-cell">{t("sheet.equipmentTable.dr")}</TableHead>
                    <TableHead className="w-24">{t("sheet.equipmentTable.state")}</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gear.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        {t("sheet.equipmentTable.empty")}
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
                            {e.data["carried"] === false ? t("sheet.equipmentTable.stored") : t("sheet.equipmentTable.carried")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            onEdit={() => openEdit(e)}
                            onDelete={() => setPendingEntryDelete(e.id)}
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
                  {t("sheet.combat.conditionTitle")}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t("sheet.combat.currentHp", { hp: sheet.stats.hp })}>
                    <Input
                      type="number"
                      value={form.current_hp ?? sheet.stats.hp}
                      onChange={(e) => patch({ current_hp: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={t("sheet.combat.currentFp", { fp: sheet.stats.fp })}>
                    <Input
                      type="number"
                      value={form.current_fp ?? sheet.stats.fp}
                      onChange={(e) => patch({ current_fp: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <div className="space-y-2">
                  <Label>{t("sheet.combat.conditionsLabel")}</Label>
                  <div className="flex flex-wrap gap-1">
                    {form.conditions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("sheet.combat.noConditions")}</p>
                    ) : (
                      form.conditions.map((c) => (
                        <Badge key={c} variant="outline" className="gap-1">
                          {c}
                          <button
                            type="button"
                            aria-label={t("sheet.combat.removeConditionAria", { condition: c })}
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
                      placeholder={t("sheet.combat.addConditionPlaceholder")}
                      onChange={(e) => setConditionInput(e.target.value)}
                    />
                    <Button type="submit" variant="outline" size="sm">
                      {tc("actions.add")}
                    </Button>
                  </form>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <Mini label={t("sheet.stats.move")} value={sheet.encumbrance.effectiveMove} />
                  <Mini label={t("sheet.stats.dodge")} value={sheet.encumbrance.effectiveDodge} />
                  <Mini label={t("sheet.stats.load")} value={sheet.encumbrance.label} />
                </div>
              </div>

              <div className="panel p-5">
                <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("sheet.combat.drTitle")}
                </h2>
                {Object.keys(sheet.dr).length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{t("sheet.combat.noArmour")}</p>
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
                  {t("sheet.combat.quickRollsTitle")}
                </h2>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["st", sheet.stats.st],
                      ["dx", sheet.stats.dx],
                      ["iq", sheet.stats.iq],
                      ["ht", sheet.stats.ht],
                      ["will", sheet.stats.will],
                      ["per", sheet.stats.per],
                    ] as const
                  ).map(([statKey, value]) => {
                    const label = t(`sheet.stats.${statKey}`);
                    return (
                    <Button
                      key={statKey}
                      variant="outline"
                      size="sm"
                      onClick={() => rollAttribute(label, value)}
                    >
                      {label} {value}
                    </Button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {t("sheet.combat.attacksTitle")}
              </h2>
              {weaponEntries.length === 0 ? (
                <div className="panel p-8 text-center text-sm text-muted-foreground">
                  {t("sheet.combat.noAttacks")}
                </div>
              ) : (
                weaponEntries.map((e) => {
                  const modes = (e.data["weapons"] ?? []) as unknown as WeaponMode[];
                  return (
                    <div key={e.id} className="panel p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{e.name}</p>
                        <RowActions
                          onEdit={() => openEdit(e)}
                          onDelete={() => setPendingEntryDelete(e.id)}
                        />
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
                            (s) =>
                              s.entry.name.toLowerCase() === (weapon.skill ?? "").toLowerCase(),
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
                                  label: t("sheet.rollLabels.damage", { name: e.name }),
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
              <Field label={t("sheet.notes.label")}>
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
                        <p className="text-sm font-medium">{v.label || t("sheet.history.snapshotLabel")}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(v.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setPendingRestore(v)}>
                      {t("sheet.history.restore")}
                    </Button>
                  </div>
                ))
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
                  {t("sheet.history.empty", { saveVersion: t("sheet.saveVersion") })}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!pendingRestore} onOpenChange={(v) => !v && setPendingRestore(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("sheet.history.restoreTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("sheet.history.restoreDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingRestore) restore.mutate(pendingRestore);
                  setPendingRestore(null);
                }}
              >
                {t("sheet.history.restore")}
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

      <PrintSheet character={form} sheet={sheet} entries={entries} portraitUrl={printPortraitUrl} />
      {exportTask.node}
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
  const { t } = useT("characters");
  const [descFor, setDescFor] = useState<CharacterEntry | null>(null);

  const descParts = (e: CharacterEntry) => {
    const mods = (e.data["modifiers"] as { name: string; percent: number }[] | undefined) ?? [];
    return [
      isCustomEntry(e.source)
        ? t("sheet.source.custom")
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
            <PlusButton label={t(`sheet.addFromPack.${kind}`)} onClick={onAddFromPack} />
          ) : null}
          <PlusButton label={t(`sheet.addCustom.${kind}`)} variant="outline" onClick={onAdd} />
        </div>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("sheet.entryGroup.empty")}</p>
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
                        aria-label={t("sheet.entryGroup.showDescriptionAria")}
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
            <DialogDescription>{descFor ? descParts(descFor).join(" · ") : ""}</DialogDescription>
          </DialogHeader>
          {descFor?.notes ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">{descFor.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("sheet.entryGroup.noDescription")}</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t: tc } = useT("common");
  return (
    <div className="no-print flex shrink-0">
      <Button size="icon" variant="ghost" onClick={onEdit} aria-label={tc("actions.edit")}>
        <Pencil className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={onDelete} aria-label={tc("actions.delete")}>
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
