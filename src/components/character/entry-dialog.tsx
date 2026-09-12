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
    base.data = { attribute: "DX", difficulty: "A", points: 1, bonus: 0, specialization: "", defaults: "", prerequisites: "" };
  }
  if (kind === "equipment") {
    base.data = { quantity: 1, weight: 0, cost: 0, carried: true, tl: 8, legality: "", dr: 0, locations: [], weapons: [] };
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
const DIFFS = [
  { value: "E", label: "Easy" },
  { value: "A", label: "Average" },
  { value: "H", label: "Hard" },
  { value: "VH", label: "Very Hard" },
];
const LOCATIONS = ["Skull", "Face", "Torso", "Vitals", "Arms", "Hands", "Legs", "Feet"];

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
          <DialogTitle>{local.id ? "Edit" : "Add"} {local.kind}</DialogTitle>
          <DialogDescription>
            All fields are yours to define. Enter only content you are licensed to use.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="Name">
              <Input value={local.name} onChange={(e) => set({ name: e.target.value })} />
            </Row>
            <Row label="Category">
              <Input value={local.category} onChange={(e) => set({ category: e.target.value })} />
            </Row>
          </div>

          {isSkill ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <Row label="Attribute">
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
              <Row label="Difficulty">
                <Select
                  value={String(local.data["difficulty"] ?? "A")}
                  onValueChange={(v) => setData({ difficulty: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <Row label="Points">
                <Input
                  type="number"
                  value={Number(local.data["points"] ?? 1)}
                  onChange={(e) => setData({ points: Number(e.target.value) })}
                />
              </Row>
              <Row label="Other bonus">
                <Input
                  type="number"
                  value={Number(local.data["bonus"] ?? 0)}
                  onChange={(e) => setData({ bonus: Number(e.target.value) })}
                />
              </Row>
              <Row label="Specialization">
                <Input
                  value={String(local.data["specialization"] ?? "")}
                  onChange={(e) => setData({ specialization: e.target.value })}
                />
              </Row>
              <Row label="Defaults">
                <Input
                  value={String(local.data["defaults"] ?? "")}
                  onChange={(e) => setData({ defaults: e.target.value })}
                />
              </Row>
              <Row label="Prerequisites" className="sm:col-span-2">
                <Input
                  value={String(local.data["prerequisites"] ?? "")}
                  onChange={(e) => setData({ prerequisites: e.target.value })}
                />
              </Row>
            </div>
          ) : isGear ? (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                <Row label="Quantity">
                  <Input
                    type="number"
                    value={Number(local.data["quantity"] ?? 1)}
                    onChange={(e) => setData({ quantity: Number(e.target.value) })}
                  />
                </Row>
                <Row label="Weight (each)">
                  <Input
                    type="number"
                    step="0.1"
                    value={Number(local.data["weight"] ?? 0)}
                    onChange={(e) => setData({ weight: Number(e.target.value) })}
                  />
                </Row>
                <Row label="Cost (each)">
                  <Input
                    type="number"
                    value={Number(local.data["cost"] ?? 0)}
                    onChange={(e) => setData({ cost: Number(e.target.value) })}
                  />
                </Row>
                <Row label="DR">
                  <Input
                    type="number"
                    value={Number(local.data["dr"] ?? 0)}
                    onChange={(e) => setData({ dr: Number(e.target.value) })}
                  />
                </Row>
                <Row label="TL">
                  <Input
                    type="number"
                    value={Number(local.data["tl"] ?? 8)}
                    onChange={(e) => setData({ tl: Number(e.target.value) })}
                  />
                </Row>
                <Row label="Legality class">
                  <Input
                    value={String(local.data["legality"] ?? "")}
                    onChange={(e) => setData({ legality: e.target.value })}
                  />
                </Row>
                <Row label="Container">
                  <Input
                    value={String(local.data["container"] ?? "")}
                    onChange={(e) => setData({ container: e.target.value })}
                  />
                </Row>
                <Row label="Carried">
                  <div className="flex h-9 items-center">
                    <Switch
                      checked={local.data["carried"] !== false}
                      onCheckedChange={(v) => setData({ carried: v })}
                    />
                  </div>
                </Row>
              </div>

              <div>
                <Label>Armour locations</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LOCATIONS.map((loc) => {
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
                        {loc}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Attack modes</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setData({ weapons: [...weapons, { name: "Attack", damage: "1d6" }] })
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add mode
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  {weapons.map((w, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
                      {(
                        [
                          ["name", "Mode"],
                          ["damage", "Damage"],
                          ["skill", "Skill"],
                          ["reach", "Reach"],
                          ["parry", "Parry"],
                          ["accuracy", "Acc"],
                          ["range", "Range"],
                          ["rof", "RoF"],
                          ["shots", "Shots"],
                          ["bulk", "Bulk"],
                          ["recoil", "Rcl"],
                        ] as const
                      ).map(([key, label]) => (
                        <Row key={key} label={label}>
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
                          onClick={() => setData({ weapons: weapons.filter((_, idx) => idx !== i) })}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove mode
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
                <Row label="Points per level">
                  <Input
                    type="number"
                    value={local.points}
                    onChange={(e) => set({ points: Number(e.target.value) })}
                  />
                </Row>
                <Row label="Levels">
                  <Input
                    type="number"
                    min={1}
                    value={local.levels}
                    onChange={(e) => set({ levels: Number(e.target.value) })}
                  />
                </Row>
                <Row label="Prerequisites">
                  <Input
                    value={String(local.data["prerequisites"] ?? "")}
                    onChange={(e) => setData({ prerequisites: e.target.value })}
                  />
                </Row>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Modifiers (enhancements / limitations)</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setData({ modifiers: [...modifiers, { name: "", percent: 0 }] })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add modifier
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  {modifiers.map((m, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder="Name"
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
                        placeholder="%"
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
                        aria-label="Remove modifier"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Row label="Notes">
            <Textarea rows={3} value={local.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Row>

          <div className="grid gap-4 sm:grid-cols-3">
            <Row label="Source label">
              <Input
                value={local.source.label}
                onChange={(e) => set({ source: { ...local.source, label: e.target.value } })}
              />
            </Row>
            <Row label="Edition">
              <Input
                value={local.source.edition}
                onChange={(e) => set({ source: { ...local.source, edition: e.target.value } })}
              />
            </Row>
            <Row label="Page ref">
              <Input
                value={local.source.page}
                onChange={(e) => set({ source: { ...local.source, page: e.target.value } })}
              />
            </Row>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onSubmit} disabled={!local.name}>
            {local.id ? "Save changes" : "Add to character"}
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
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
