import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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

export interface WorldCalendar {
  era: string;
  months: string[];
  days_per_month: number;
  current: string;
}

export const DEFAULT_CALENDAR: WorldCalendar = {
  era: "",
  months: [],
  days_per_month: 30,
  current: "",
};

/** Reads the in-world calendar out of the campaign settings blob. */
export function calendarOf(settings: unknown): WorldCalendar {
  const raw = ((settings ?? {}) as Record<string, unknown>)["calendar"];
  const value = (raw ?? {}) as Partial<WorldCalendar>;
  return {
    era: typeof value.era === "string" ? value.era : "",
    months: Array.isArray(value.months) ? value.months.map(String) : [],
    days_per_month: Number(value.days_per_month) > 0 ? Number(value.days_per_month) : 30,
    current: typeof value.current === "string" ? value.current : "",
  };
}

function num(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Sort key for an event: year, then month (calendar order or number), then day. */
export function eventOrder(row: EntityRow, months: string[]): [number, number, number] {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const year = num(data["year"]) ?? Number.POSITIVE_INFINITY;
  const rawMonth = String(data["month"] ?? "").trim();
  const byName = months.findIndex((m) => m.toLowerCase() === rawMonth.toLowerCase());
  const month = byName >= 0 ? byName + 1 : (num(rawMonth) ?? 0);
  const day = num(data["day"]) ?? 0;
  return [year, month, day];
}

function eventLabel(row: EntityRow): string {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const parts = [data["day"], data["month"], data["year"]]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean);
  const era = String(data["era"] ?? "").trim();
  const stamp = parts.join(" ");
  return [stamp, era].filter(Boolean).join(" · ") || "Undated";
}

export function TimelinePanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [form, setForm] = useState({ name: "", year: "", month: "", day: "", summary: "" });
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
      const [ay, am, ad] = eventOrder(a, calendar.months);
      const [by, bm, bd] = eventOrder(b, calendar.months);
      return ay - by || am - bm || ad - bd || a.name.localeCompare(b.name);
    });
  }, [entities.data, calendar.months]);

  const create = useMutation({
    mutationFn: () =>
      createEntity({
        campaign_id: campaignId,
        kind: "EVENT",
        name: form.name.trim(),
        status: "Historical",
        visibility: isGm ? "GM_ONLY" : "ALL_PLAYERS",
        summary: form.summary.trim() || null,
        created_by: user!.id,
        data: {
          year: form.year.trim(),
          month: form.month.trim(),
          day: form.day.trim(),
          era: calendar.era,
        },
      } as never),
    onSuccess: () => {
      setForm({ name: "", year: "", month: "", day: "", summary: "" });
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
          {calendar.current
            ? `Today in the world: ${calendar.current}${calendar.era ? ` (${calendar.era})` : ""}`
            : "Set an in-world calendar to order events by your own months."}
        </p>
        {isGm ? (
          <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-1 h-4 w-4" /> Calendar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>In-world calendar</DialogTitle>
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
                  toast.success("Calendar saved.");
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
                          {eventLabel(row)}
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
            <p className="text-sm text-muted-foreground">No events on the timeline yet.</p>
          )}
        </div>

        <div className="panel h-fit space-y-3 p-4">
          <h3 className="font-display text-sm font-semibold">Add an event</h3>
          <Input
            placeholder="Event name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="Year"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
            <Input
              placeholder="Month"
              value={form.month}
              onChange={(e) => setForm({ ...form, month: e.target.value })}
              list="world-months"
            />
            <Input
              placeholder="Day"
              value={form.day}
              onChange={(e) => setForm({ ...form, day: e.target.value })}
            />
          </div>
          <datalist id="world-months">
            {calendar.months.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Textarea
            rows={3}
            placeholder="Short summary"
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
          <Button
            className="w-full"
            onClick={() => create.mutate()}
            disabled={!form.name.trim() || create.isPending}
          >
            <Plus className="mr-1 h-4 w-4" /> Add event
          </Button>
        </div>
      </div>
    </div>
  );
}

const GREGORIAN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function CalendarForm({
  calendar,
  onSave,
}: {
  calendar: WorldCalendar;
  onSave: (next: WorldCalendar) => Promise<void>;
}) {
  const [era, setEra] = useState(calendar.era);
  const [months, setMonths] = useState(calendar.months.join("\n"));
  const [days, setDays] = useState(String(calendar.days_per_month));
  const [current, setCurrent] = useState(calendar.current);
  const [saving, setSaving] = useState(false);

  const useGregorian = () => {
    setEra("AD");
    setMonths(GREGORIAN_MONTHS.join("\n"));
    setDays("30");
    if (!current.trim()) {
      const today = new Date();
      setCurrent(
        `${today.getDate()} ${GREGORIAN_MONTHS[today.getMonth()]}, ${today.getFullYear()}`,
      );
    }
  };

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" onClick={useGregorian}>
        Use Gregorian calendar
      </Button>
      <div className="space-y-1">
        <Label htmlFor="cal-era">Era name</Label>
        <Input id="cal-era" value={era} onChange={(e) => setEra(e.target.value)} placeholder="Third Age" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cal-months">Months, one per line</Label>
        <Textarea
          id="cal-months"
          rows={6}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          placeholder={"Frostmoon\nSeedtide\nHighsun"}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cal-days">Days per month</Label>
          <Input id="cal-days" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cal-current">Current date</Label>
          <Input
            id="cal-current"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="12 Highsun, 998"
          />
        </div>
      </div>
      <Button
        className="w-full"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave({
              era: era.trim(),
              months: months.split("\n").map((m) => m.trim()).filter(Boolean),
              days_per_month: Number(days) > 0 ? Number(days) : 30,
              current: current.trim(),
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        Save calendar
      </Button>
    </div>
  );
}
