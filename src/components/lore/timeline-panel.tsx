import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronDown, ChevronUp, Plus, Settings2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getCampaign, updateCampaign } from "@/lib/api";
import { createEntity, listEntities, type EntityRow } from "@/lib/lore";
import { useSession } from "@/hooks/use-session";
import { EntityDeleteButton } from "@/components/lore/entity-delete-button";
import {
  calendarOf,
  eventOrder,
  formatWorldDate,
  validateWorldDate,
  GREGORIAN_PRESET,
  type LeapRule,
  type MonthDef,
  type SeasonDef,
  type TodayDate,
  type UnitName,
  type WorldCalendar,
} from "@/lib/world-calendar";

export type { WorldCalendar } from "@/lib/world-calendar";

function eventLabel(row: EntityRow, calendar: WorldCalendar): string {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const date: Partial<{ year: number; month: number; day: number }> = {};
  if (data["year"]) date.year = Number(data["year"]);
  if (data["month"]) {
    const idx = calendar.months.findIndex(
      (m) => m.name.toLowerCase() === String(data["month"]).toLowerCase(),
    );
    if (idx >= 0) date.month = idx + 1;
    else if (Number(data["month"])) date.month = Number(data["month"]);
  }
  if (data["day"]) date.day = Number(data["day"]);
  return formatWorldDate(calendar, date);
}

export function TimelinePanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [form, setForm] = useState({
    name: "",
    year: "",
    month: "",
    day: "",
    hour: "",
    minute: "",
    summary: "",
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  const campaign = useQuery({ queryKey: ["campaign", campaignId], queryFn: () => getCampaign(campaignId) });
  const entities = useQuery({
    queryKey: ["lore-entities", campaignId],
    queryFn: () => listEntities(campaignId),
  });

  const calendar = useMemo(() => calendarOf(campaign.data?.settings), [campaign.data?.settings]);

  const events = useMemo(() => {
    const rows = (entities.data ?? []).filter((e) => e.kind === "EVENT");
    return rows.sort((a, b) => {
      const [ay, am, ad, ah, amin] = eventOrder(a, calendar);
      const [by, bm, bd, bh, bmin] = eventOrder(b, calendar);
      return ay - by || am - bm || ad - bd || ah - bh || amin - bmin || a.name.localeCompare(b.name);
    });
  }, [entities.data, calendar]);

  const todayLabel = useMemo(() => {
    if (calendar.today) return formatWorldDate(calendar, calendar.today);
    return calendar.currentText || null;
  }, [calendar]);

  const create = useMutation({
    mutationFn: () => {
      const yearNum = form.year.trim() ? Number(form.year) : undefined;
      const monthIdx = calendar.months.findIndex(
        (m) => m.name.toLowerCase() === form.month.toLowerCase(),
      );
      const monthValue = monthIdx >= 0 ? form.month : form.month.trim();
      const dayNum = Number(form.day);
      const hourNum = form.hour.trim() ? Number(form.hour) : undefined;
      const minuteNum = form.minute.trim() ? Number(form.minute) : undefined;

      if (form.month && monthIdx >= 0 && form.day) {
        const check: Parameters<typeof validateWorldDate>[1] = {
          month: monthIdx + 1,
          day: dayNum,
        };
        if (yearNum !== undefined) check.year = yearNum;
        if (hourNum !== undefined) check.hour = hourNum;
        if (minuteNum !== undefined) check.minute = minuteNum;
        const err = validateWorldDate(calendar, check);
        if (err) throw new Error(err);
      }

      return createEntity({
        campaign_id: campaignId,
        kind: "EVENT",
        name: form.name.trim(),
        status: "Historical",
        visibility: isGm ? "GM_ONLY" : "ALL_PLAYERS",
        summary: form.summary.trim() || null,
        created_by: user!.id,
        data: {
          year: form.year.trim(),
          month: monthValue,
          day: form.day.trim(),
          hour: form.hour.trim(),
          minute: form.minute.trim(),
          era: calendar.era,
        },
      } as never);
    },
    onSuccess: () => {
      setForm({ name: "", year: "", month: "", day: "", hour: "", minute: "", summary: "" });
      queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
      toast.success("Event added.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <CalendarClock className="h-4 w-4 text-muted-foreground" />
        <p className="flex-1 text-sm text-muted-foreground">
          {todayLabel
            ? `${calendar.units.year.singular} atual: ${todayLabel}${calendar.era ? ` (${calendar.era})` : ""}`
            : `Defina um ${calendar.units.year.singular.toLowerCase()} atual para ordenar eventos pelo seu calendário.`}
        </p>
        {isGm ? (
          <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-1 h-4 w-4" /> Calendário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Calendário do mundo</DialogTitle>
              </DialogHeader>
              <CalendarForm
                calendar={calendar}
                onSave={async (next) => {
                  const settings = (campaign.data?.settings ?? {}) as Record<string, unknown>;
                  await updateCampaign(campaignId, {
                    settings: { ...settings, calendar: next } as never,
                  });
                  await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
                  setCalendarOpen(false);
                  toast.success("Calendário salvo.");
                }}
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {entities.isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
          ) : events.length ? (
            <ol className="relative space-y-3 border-l border-border pl-5">
              {events.map((row) => (
                <li key={row.id} className="relative">
                  <span className="absolute -left-[26px] top-3 h-2 w-2 rounded-full bg-primary" />
                  <Link
                    to="/entities/$id"
                    params={{ id: row.id }}
                    className="panel block p-4 transition hover:border-primary/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium">{row.name}</h3>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {eventLabel(row, calendar)}
                        </Badge>
                        {isGm ? (
                          <EntityDeleteButton
                            campaignId={campaignId}
                            entityId={row.id}
                            name={row.name}
                          />
                        ) : null}
                      </div>
                    </div>
                    {row.summary ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.summary}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum evento na timeline ainda.</p>
          )}
        </div>

        <div className="panel h-fit space-y-3 p-4">
          <h3 className="font-display text-sm font-semibold">Adicionar evento</h3>
          <Input
            placeholder="Nome do evento"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={calendar.units.year.singular}
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              inputMode="numeric"
            />
            <Input
              placeholder={calendar.units.day.singular}
              value={form.day}
              onChange={(e) => setForm({ ...form, day: e.target.value })}
              inputMode="numeric"
            />
          </div>
          {calendar.months.length > 0 ? (
            <Select
              value={form.month}
              onValueChange={(v) => setForm({ ...form, month: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={calendar.units.month.singular} />
              </SelectTrigger>
              <SelectContent>
                {calendar.months.map((m, i) => (
                  <SelectItem key={i} value={m.name}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder={calendar.units.month.singular}
              value={form.month}
              onChange={(e) => setForm({ ...form, month: e.target.value })}
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder={`${calendar.units.hour.singular} (opc.)`}
              value={form.hour}
              onChange={(e) => setForm({ ...form, hour: e.target.value })}
              inputMode="numeric"
            />
            <Input
              placeholder={`${calendar.units.minute.singular} (opc.)`}
              value={form.minute}
              onChange={(e) => setForm({ ...form, minute: e.target.value })}
              inputMode="numeric"
            />
          </div>
          <Textarea
            rows={3}
            placeholder="Resumo"
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
          <Button
            className="w-full"
            onClick={() => create.mutate()}
            disabled={!form.name.trim() || create.isPending}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar evento
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Calendar editor ───────────────────────────────────────────────

const UNIT_KEYS = [
  ["era", "Era"],
  ["year", "Ano / Ciclo"],
  ["season", "Estação / Quarto"],
  ["month", "Mês"],
  ["week", "Semana"],
  ["day", "Dia / Rota"],
  ["hour", "Hora / Quarto"],
  ["minute", "Minuto / Parte"],
] as const;

function blockLeapRule(rule: LeapRule): { block: number; years: number[]; month: number; extraDays: number } {
  return rule.kind === "block" ? rule : { block: 10, years: [4, 7, 10], month: 0, extraDays: 1 };
}

function CalendarForm({
  calendar,
  onSave,
}: {
  calendar: WorldCalendar;
  onSave: (next: WorldCalendar) => Promise<void>;
}) {
  const [draft, setDraft] = useState<WorldCalendar>(() => ({
    ...calendar,
    units: { ...calendar.units },
    months: calendar.months.map((m) => ({ ...m })),
    seasons: calendar.seasons.map((s) => ({ ...s, months: [...s.months] })),
    week: { ...calendar.week, dayNames: [...calendar.week.dayNames] },
    daySubdivision: { ...calendar.daySubdivision },
    today: calendar.today ? { ...calendar.today } : null,
  }));
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<WorldCalendar>) => setDraft((d) => ({ ...d, ...patch }));
  const updateUnits = (key: keyof WorldCalendar["units"], field: keyof UnitName, value: string) =>
    setDraft((d) => ({
      ...d,
      units: { ...d.units, [key]: { ...d.units[key], [field]: value } },
    }));

  const useGregorian = () => {
    setDraft({
      ...GREGORIAN_PRESET,
      units: { ...GREGORIAN_PRESET.units },
      months: GREGORIAN_PRESET.months.map((m) => ({ ...m })),
      seasons: GREGORIAN_PRESET.seasons.map((s) => ({ ...s, months: [...s.months] })),
      week: { ...GREGORIAN_PRESET.week, dayNames: [...GREGORIAN_PRESET.week.dayNames] },
      era: draft.era,
      today: draft.today,
    });
  };

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" onClick={useGregorian}>
        Usar calendário gregoriano
      </Button>

      <Tabs defaultValue="units" className="w-full">
        <TabsList className="flex gap-1 overflow-x-auto pb-1">
          <TabsTrigger value="units">Unidades</TabsTrigger>
          <TabsTrigger value="months">Meses</TabsTrigger>
          <TabsTrigger value="seasons">Estações</TabsTrigger>
          <TabsTrigger value="cycle">Ciclo</TabsTrigger>
          <TabsTrigger value="today">Hoje</TabsTrigger>
        </TabsList>

        {/* ── Unidades ── */}
        <TabsContent value="units" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Nomes canônicos das unidades de tempo (singular / plural).
          </p>
          {UNIT_KEYS.map(([key, label]) => (
            <div key={key} className="grid grid-cols-[100px_1fr_1fr] items-center gap-2">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                className="h-8"
                value={draft.units[key].singular}
                onChange={(e) => updateUnits(key, "singular", e.target.value)}
              />
              <Input
                className="h-8"
                value={draft.units[key].plural}
                onChange={(e) => updateUnits(key, "plural", e.target.value)}
              />
            </div>
          ))}
          <div className="space-y-1 pt-1">
            <Label htmlFor="cal-era">Nome da era</Label>
            <Input
              id="cal-era"
              value={draft.era}
              onChange={(e) => update({ era: e.target.value })}
              placeholder="Terceira Era"
            />
          </div>
        </TabsContent>

        {/* ── Meses ── */}
        <TabsContent value="months" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Cada {draft.units.month.singular.toLowerCase()} com a sua duração em{" "}
            {draft.units.day.plural.toLowerCase()}.
          </p>
          {draft.months.map((m, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={i === 0}
                  onClick={() =>
                    setDraft((d) => {
                      const months = [...d.months];
                      const a = months[i - 1]!;
                      const b = months[i]!;
                      months[i - 1] = b;
                      months[i] = a;
                      return { ...d, months };
                    })
                  }
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={i === draft.months.length - 1}
                  onClick={() =>
                    setDraft((d) => {
                      const months = [...d.months];
                      const a = months[i]!;
                      const b = months[i + 1]!;
                      months[i] = b;
                      months[i + 1] = a;
                      return { ...d, months };
                    })
                  }
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
              <Input
                className="h-8 flex-1"
                value={m.name}
                onChange={(e) =>
                  setDraft((d) => {
                    const months = [...d.months];
                    months[i] = { ...months[i]!, name: e.target.value };
                    return { ...d, months };
                  })
                }
              />
              <Input
                className="h-8 w-20"
                type="number"
                value={m.days}
                onChange={(e) =>
                  setDraft((d) => {
                    const months = [...d.months];
                    months[i] = { ...months[i]!, days: Number(e.target.value) || 0 };
                    return { ...d, months };
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setDraft((d) => {
                    const months = d.months.filter((_, j) => j !== i);
                    return { ...d, months };
                  })
                }
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                months: [...d.months, { name: `Mês ${d.months.length + 1}`, days: 30 }],
              }))
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar {draft.units.month.singular.toLowerCase()}
          </Button>
        </TabsContent>

        {/* ── Estações ── */}
        <TabsContent value="seasons" className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Agrupe {draft.units.month.plural.toLowerCase()} em{" "}
            {draft.units.season.plural.toLowerCase()} / quartos.
          </p>
          {draft.seasons.map((s, i) => (
            <div key={i} className="panel space-y-2 p-2">
              <div className="flex items-center gap-2">
                <Input
                  className="h-8 flex-1"
                  placeholder="Nome"
                  value={s.name}
                  onChange={(e) =>
                    setDraft((d) => {
                      const seasons = [...d.seasons];
                      seasons[i] = { ...seasons[i]!, name: e.target.value };
                      return { ...d, seasons };
                    })
                  }
                />
                <Input
                  className="h-8 flex-1"
                  placeholder="Lema (opc.)"
                  value={s.subtitle}
                  onChange={(e) =>
                    setDraft((d) => {
                      const seasons = [...d.seasons];
                      seasons[i] = { ...seasons[i]!, subtitle: e.target.value };
                      return { ...d, seasons };
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      seasons: d.seasons.filter((_, j) => j !== i),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {draft.months.map((m, mi) => {
                  const checked = s.months.includes(mi);
                  return (
                    <Button
                      key={mi}
                      variant={checked ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        setDraft((d) => {
                          const seasons = [...d.seasons];
                          const prev = seasons[i]!;
                          const months = checked
                            ? prev.months.filter((x) => x !== mi)
                            : [...prev.months, mi];
                          seasons[i] = { ...prev, months };
                          return { ...d, seasons };
                        })
                      }
                    >
                      {m.name || `Mês ${mi + 1}`}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                seasons: [...d.seasons, { name: `Estação ${d.seasons.length + 1}`, subtitle: "", months: [] }],
              }))
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar {draft.units.season.singular.toLowerCase()}
          </Button>
        </TabsContent>

        {/* ── Ciclo ── */}
        <TabsContent value="cycle" className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{draft.units.day.plural} por {draft.units.week.singular.toLowerCase()}</Label>
              <Input
                className="h-8"
                type="number"
                value={draft.week.daysPerWeek}
                onChange={(e) =>
                  update({ week: { ...draft.week, daysPerWeek: Number(e.target.value) || 0 } })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{draft.units.hour.plural} por {draft.units.day.singular.toLowerCase()}</Label>
              <Input
                className="h-8"
                type="number"
                value={draft.daySubdivision.hoursPerDay}
                onChange={(e) =>
                  update({
                    daySubdivision: { ...draft.daySubdivision, hoursPerDay: Number(e.target.value) || 0 },
                  })
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{draft.units.minute.plural} por {draft.units.hour.singular.toLowerCase()}</Label>
            <Input
              className="h-8"
              type="number"
              value={draft.daySubdivision.minutesPerHour}
              onChange={(e) =>
                update({
                  daySubdivision: { ...draft.daySubdivision, minutesPerHour: Number(e.target.value) || 0 },
                })
              }
            />
          </div>
          {draft.week.daysPerWeek > 0 ? (
            <div className="space-y-1">
              <Label className="text-xs">Nomes dos {draft.units.day.plural.toLowerCase()} da semana</Label>
              <Textarea
                rows={Math.max(2, draft.week.dayNames.length)}
                value={draft.week.dayNames.join("\n")}
                onChange={(e) =>
                  update({
                    week: { ...draft.week, dayNames: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) },
                  })
                }
                placeholder={"Domingo\nSegunda\nTerça"}
              />
            </div>
          ) : null}

          {/* Leap rule */}
          <div className="space-y-2">
            <Label className="text-xs">{draft.units.year.singular} bissexto</Label>
            <Select
              value={draft.leapRule.kind}
              onValueChange={(v) => {
                let leapRule: LeapRule;
                if (v === "gregorian") leapRule = { kind: "gregorian" };
                else if (v === "block")
                  leapRule = { kind: "block", block: 10, years: [4, 7, 10], month: 0, extraDays: 1 };
                else leapRule = { kind: "none" };
                update({ leapRule });
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                <SelectItem value="gregorian">Gregoriano (a cada 4, exceto 100)</SelectItem>
                <SelectItem value="block">Por bloco (ex.: 4, 7, 10 de cada 10)</SelectItem>
              </SelectContent>
            </Select>
            {draft.leapRule.kind === "block" ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tamanho do bloco</Label>
                  <Input
                    className="h-8"
                    type="number"
                    value={draft.leapRule.kind === "block" ? draft.leapRule.block : 10}
                    onChange={(e) =>
                      update({ leapRule: { kind: "block", ...blockLeapRule(draft.leapRule), block: Number(e.target.value) || 1 } })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Anos bissextos no bloco</Label>
                  <Input
                    className="h-8"
                    value={draft.leapRule.kind === "block" ? draft.leapRule.years.join(", ") : "4, 7, 10"}
                    onChange={(e) =>
                      update({
                        leapRule: {
                          kind: "block",
                          ...blockLeapRule(draft.leapRule),
                          years: e.target.value
                            .split(",")
                            .map((s) => Number(s.trim()))
                            .filter((n) => Number.isFinite(n)),
                        },
                      })
                    }
                    placeholder="4, 7, 10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{draft.units.month.singular} que recebe dia extra</Label>
                  <Select
                    value={draft.leapRule.kind === "block" ? String(draft.leapRule.month) : "0"}
                    onValueChange={(v) =>
                      update({ leapRule: { kind: "block", ...blockLeapRule(draft.leapRule), month: Number(v) } })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {draft.months.map((m, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {m.name || `Mês ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{draft.units.day.plural} extras</Label>
                  <Input
                    className="h-8"
                    type="number"
                    value={draft.leapRule.kind === "block" ? draft.leapRule.extraDays : 1}
                    onChange={(e) =>
                      update({ leapRule: { kind: "block", ...blockLeapRule(draft.leapRule), extraDays: Number(e.target.value) || 1 } })
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>
        </TabsContent>

        {/* ── Hoje ── */}
        <TabsContent value="today" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Data atual do mundo. Usada para mostrar "hoje" e ordenar eventos próximos.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{draft.units.year.singular}</Label>
              <Input
                className="h-8"
                type="number"
                value={draft.today?.year ?? ""}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  update({ today: { ...(draft.today ?? { year: 0, month: 1, day: 1, hour: 0, minute: 0 }), year: v } });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{draft.units.month.singular}</Label>
              <Select
                value={draft.today ? String(draft.today.month) : ""}
                onValueChange={(v) => {
                  const m = Number(v);
                  update({ today: { ...(draft.today ?? { year: 0, month: m, day: 1, hour: 0, minute: 0 }), month: m } });
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {draft.months.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {m.name || `Mês ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{draft.units.day.singular}</Label>
              <Input
                className="h-8"
                type="number"
                value={draft.today?.day ?? ""}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  update({ today: { ...(draft.today ?? { year: 0, month: 1, day: d, hour: 0, minute: 0 }), day: d } });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{draft.units.hour.singular} (opc.)</Label>
              <Input
                className="h-8"
                type="number"
                value={draft.today?.hour ?? ""}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  update({ today: { ...(draft.today ?? { year: 0, month: 1, day: 1, hour: h, minute: 0 }), hour: h } });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{draft.units.minute.singular} (opc.)</Label>
              <Input
                className="h-8"
                type="number"
                value={draft.today?.minute ?? ""}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  update({ today: { ...(draft.today ?? { year: 0, month: 1, day: 1, hour: 0, minute: m }), minute: m } });
                }}
              />
            </div>
          </div>
          {draft.today ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ today: null })}
            >
              Limpar data atual
            </Button>
          ) : null}
        </TabsContent>
      </Tabs>

      <Button
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            // Strip legacy currentText if today is set
            const next: WorldCalendar = {
              ...draft,
              currentText: draft.today ? "" : draft.currentText,
            };
            await onSave(next);
          } finally {
            setSaving(false);
          }
        }}
      >
        Salvar calendário
      </Button>
    </div>
  );
}
