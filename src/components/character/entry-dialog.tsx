import * as React from "react";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CharacterEntry, EntryKind, TraitModifier, WeaponMode } from "@/rules";
import { useT } from "@/i18n/hooks";

export interface EntryDraft {
  id?: string;
  kind: EntryKind;
  name: string;
  category: string;
  points: number;
  levels: number;
  notes: string;
  data: Record<string, unknown>;
  source: { label: string; edition: string; page: string; type: string };
}

export function emptyDraft(kind: EntryKind): EntryDraft {
  const base: EntryDraft = {
    kind,
    name: "",
    category: "",
    points: 0,
    levels: 1,
    notes: "",
    data: {},
    source: { label: "User created", edition: "", page: "", type: "user" },
  };
  if (kind === "skill" || kind === "technique" || kind === "spell") {
    base.data = {
      attribute: "DX",
      difficulty: "A",
      points: 1,
      bonus: 0,
      specialization: "",
      defaults: "",
      prerequisites: "",
    };
  }
  if (kind === "equipment") {
    base.data = {
      quantity: 1,
      weight: 0,
      cost: 0,
      carried: true,
      tl: 8,
      legality: "",
      dr: 0,
      locations: [],
      weapons: [],
    };
  }
  return base;
}

export function toDraft(entry: CharacterEntry): EntryDraft {
  const s = (entry.source ?? {}) as Record<string, string | undefined>;
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    category: entry.category ?? "",
    points: entry.points,
    levels: entry.levels,
    notes: entry.notes ?? "",
    data: { ...(entry.data as Record<string, unknown>) },
    source: {
      label: s["label"] ?? "User created",
      edition: s["edition"] ?? "",
      page: s["page"] ?? "",
      type: s["type"] ?? "user",
    },
  };
}

const ATTRS = ["ST", "DX", "IQ", "HT", "Will", "Per"];
const DIFFICULTY_VALUES = ["E", "A", "H", "VH"] as const;
const DIFFICULTY_KEYS = {
  E: "easy",
  A: "average",
  H: "hard",
  VH: "veryHard",
} as const satisfies Record<(typeof DIFFICULTY_VALUES)[number], string>;
const LOCATION_VALUES = [
  "Skull",
  "Face",
  "Torso",
  "Vitals",
  "Arms",
  "Hands",
  "Legs",
  "Feet",
] as const;
const LOCATION_KEYS = {
  Skull: "skull",
  Face: "face",
  Torso: "torso",
  Vitals: "vitals",
  Arms: "arms",
  Hands: "hands",
  Legs: "legs",
  Feet: "feet",
} as const satisfies Record<(typeof LOCATION_VALUES)[number], string>;
const WEAPON_FIELD_KEYS = [
  ["name", "mode"],
  ["damage", "damage"],
  ["skill", "skill"],
  ["reach", "reach"],
  ["parry", "parry"],
  ["accuracy", "acc"],
  ["range", "range"],
  ["rof", "rof"],
  ["shots", "shots"],
  ["bulk", "bulk"],
  ["recoil", "rcl"],
] as const;

export function EntryDialog({
  open,
  onOpenChange,
  draft,
  onChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  draft: EntryDraft;
  onChange: (d: EntryDraft) => void;
  onSubmit: () => void;
}) {
  const { t } = useT("characters");
  const [local, setLocal] = useState(draft);
  useEffect(() => setLocal(draft), [draft]);

  const set = (patch: Partial<EntryDraft>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  };
  const setData = (patch: Record<string, unknown>) => set({ data: { ...local.data, ...patch } });

  const isSkill = local.kind === "skill" || local.kind === "technique" || local.kind === "spell";
  const isGear = local.kind === "equipment";
  const modifiers = (local.data["modifiers"] as TraitModifier[] | undefined) ?? [];
  const weapons = (local.data["weapons"] as WeaponMode[] | undefined) ?? [];
  const locations = (local.data["locations"] as string[] | undefined) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {local.id
              ? t("sheet.entryDialog.titleEdit", { kind: t(`sheet.kindName.${local.kind}`) })
              : t("sheet.entryDialog.titleAdd", { kind: t(`sheet.kindName.${local.kind}`) })}
          </DialogTitle>
          <DialogDescription>{t("sheet.entryDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Row label={t("sheet.entryDialog.name")}>
              <Input value={local.name} onChange={(e) => set({ name: e.target.value })} />
            </Row>
            <Row label={t("sheet.entryDialog.category")}>
              <Input value={local.category} onChange={(e) => set({ category: e.target.value })} />
            </Row>
          </div>

          {isSkill ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <Row label={t("sheet.entryDialog.attribute")}>
                <Select
                  value={String(local.data["attribute"] ?? "DX")}
                  onValueChange={(v) => setData({ attribute: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ATTRS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={t("sheet.entryDialog.difficulty")}>
                <Select
                  value={String(local.data["difficulty"] ?? "A")}
                  onValueChange={(v) => setData({ difficulty: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTY_VALUES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {t(`sheet.entryDialog.difficulties.${DIFFICULTY_KEYS[d]}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={t("sheet.entryDialog.points")}>
                <Input
                  type="number"
                  value={Number(local.data["points"] ?? 1)}
                  onChange={(e) => setData({ points: Number(e.target.value) })}
                />
              </Row>
              <Row label={t("sheet.entryDialog.otherBonus")}>
                <Input
                  type="number"
                  value={Number(local.data["bonus"] ?? 0)}
                  onChange={(e) => setData({ bonus: Number(e.target.value) })}
                />
              </Row>
              <Row label={t("sheet.entryDialog.specialization")}>
                <Input
                  value={String(local.data["specialization"] ?? "")}
                  onChange={(e) => setData({ specialization: e.target.value })}
                />
              </Row>
              <Row label={t("sheet.entryDialog.defaults")}>
                <Input
                  value={String(local.data["defaults"] ?? "")}
                  onChange={(e) => setData({ defaults: e.target.value })}
                />
              </Row>
              <Row label={t("sheet.entryDialog.prerequisites")} className="sm:col-span-2">
                <Input
                  value={String(local.data["prerequisites"] ?? "")}
                  onChange={(e) => setData({ prerequisites: e.target.value })}
                />
              </Row>
            </div>
          ) : isGear ? (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <Row label={t("sheet.entryDialog.quantity")}>
                  <Input
                    type="number"
                    value={Number(local.data["quantity"] ?? 1)}
                    onChange={(e) => setData({ quantity: Number(e.target.value) })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.weightEach")}>
                  <Input
                    type="number"
                    step="0.1"
                    value={Number(local.data["weight"] ?? 0)}
                    onChange={(e) => setData({ weight: Number(e.target.value) })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.costEach")}>
                  <Input
                    type="number"
                    value={Number(local.data["cost"] ?? 0)}
                    onChange={(e) => setData({ cost: Number(e.target.value) })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.dr")}>
                  <Input
                    type="number"
                    value={Number(local.data["dr"] ?? 0)}
                    onChange={(e) => setData({ dr: Number(e.target.value) })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.tl")}>
                  <Input
                    type="number"
                    value={Number(local.data["tl"] ?? 8)}
                    onChange={(e) => setData({ tl: Number(e.target.value) })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.legalityClass")}>
                  <Input
                    value={String(local.data["legality"] ?? "")}
                    onChange={(e) => setData({ legality: e.target.value })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.container")}>
                  <Input
                    value={String(local.data["container"] ?? "")}
                    onChange={(e) => setData({ container: e.target.value })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.carried")}>
                  <div className="flex h-9 items-center">
                    <Switch
                      checked={local.data["carried"] !== false}
                      onCheckedChange={(v) => setData({ carried: v })}
                    />
                  </div>
                </Row>
              </div>

              <div>
                <Label>{t("sheet.entryDialog.armourLocations")}</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LOCATION_VALUES.map((loc) => {
                    const active = locations.includes(loc);
                    return (
                      <button
                        key={loc}
                        type="button"
                        onClick={() =>
                          setData({
                            locations: active
                              ? locations.filter((l) => l !== loc)
                              : [...locations, loc],
                          })
                        }
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary/15 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t(`sheet.entryDialog.locations.${LOCATION_KEYS[loc]}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>{t("sheet.entryDialog.attackModes")}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setData({ weapons: [...weapons, { name: "Attack", damage: "1d6" }] })
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> {t("sheet.entryDialog.addMode")}
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  {weapons.map((w, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-4"
                    >
                      {WEAPON_FIELD_KEYS.map(([key, labelKey]) => (
                        <Row key={key} label={t(`sheet.entryDialog.weaponFields.${labelKey}`)}>
                          <Input
                            value={String(w[key] ?? "")}
                            onChange={(e) => {
                              const next = weapons.map((m, idx) =>
                                idx === i ? { ...m, [key]: e.target.value } : m,
                              );
                              setData({ weapons: next });
                            }}
                          />
                        </Row>
                      ))}
                      <div className="col-span-2 flex items-end sm:col-span-4">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setData({ weapons: weapons.filter((_, idx) => idx !== i) })
                          }
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />{" "}
                          {t("sheet.entryDialog.removeMode")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Row label={t("sheet.entryDialog.pointsPerLevel")}>
                  <Input
                    type="number"
                    value={local.points}
                    onChange={(e) => set({ points: Number(e.target.value) })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.levels")}>
                  <Input
                    type="number"
                    min={1}
                    value={local.levels}
                    onChange={(e) => set({ levels: Number(e.target.value) })}
                  />
                </Row>
                <Row label={t("sheet.entryDialog.prerequisites")}>
                  <Input
                    value={String(local.data["prerequisites"] ?? "")}
                    onChange={(e) => setData({ prerequisites: e.target.value })}
                  />
                </Row>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>{t("sheet.entryDialog.modifiers")}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setData({ modifiers: [...modifiers, { name: "", percent: 0 }] })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> {t("sheet.entryDialog.addModifier")}
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  {modifiers.map((m, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder={t("sheet.entryDialog.modifierName")}
                        value={m.name}
                        onChange={(e) => {
                          const next = modifiers.map((x, idx) =>
                            idx === i ? { ...x, name: e.target.value } : x,
                          );
                          setData({ modifiers: next });
                        }}
                      />
                      <Input
                        type="number"
                        className="w-28"
                        placeholder={t("sheet.entryDialog.modifierPercent")}
                        value={m.percent}
                        onChange={(e) => {
                          const next = modifiers.map((x, idx) =>
                            idx === i ? { ...x, percent: Number(e.target.value) } : x,
                          );
                          setData({ modifiers: next });
                        }}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setData({ modifiers: modifiers.filter((_, idx) => idx !== i) })
                        }
                        aria-label={t("sheet.entryDialog.removeModifierAria")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Row label={t("sheet.entryDialog.notes")}>
            <Textarea
              rows={3}
              value={local.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </Row>

          <div className="grid gap-4 sm:grid-cols-3">
            <Row label={t("sheet.entryDialog.sourceLabel")}>
              <Input
                value={local.source.label}
                onChange={(e) => set({ source: { ...local.source, label: e.target.value } })}
              />
            </Row>
            <Row label={t("sheet.entryDialog.edition")}>
              <Input
                value={local.source.edition}
                onChange={(e) => set({ source: { ...local.source, edition: e.target.value } })}
              />
            </Row>
            <Row label={t("sheet.entryDialog.pageRef")}>
              <Input
                value={local.source.page}
                onChange={(e) => set({ source: { ...local.source, page: e.target.value } })}
              />
            </Row>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onSubmit} disabled={!local.name}>
            {local.id ? t("sheet.entryDialog.saveChanges") : t("sheet.entryDialog.addToCharacter")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
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
