/**
 * World calendar — pure logic, no React, no DOM.
 *
 * A campaign calendar lives in `campaigns.settings.calendar` (jsonb) and is
 * parsed by `calendarOf`. The old shape (`months: string[]`, `days_per_month`,
 * `current: string`) is auto-migrated in memory and re-written in the new
 * shape the next time the calendar is saved.
 */

export interface UnitName {
  singular: string;
  plural: string;
}

export interface MonthDef {
  name: string;
  days: number;
}

export interface SeasonDef {
  name: string;
  subtitle: string;
  /** 0-based indices into the months array */
  months: number[];
}

export type LeapRule =
  | { kind: "none" }
  | { kind: "gregorian" }
  | { kind: "block"; block: number; years: number[]; month: number; extraDays: number };

export interface WeekDef {
  daysPerWeek: number;
  dayNames: string[];
}

export interface DaySubdivision {
  hoursPerDay: number;
  minutesPerHour: number;
}

export interface TodayDate {
  year: number;
  /** 1-based month index */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface WorldCalendar {
  era: string;
  units: {
    era: UnitName;
    year: UnitName;
    season: UnitName;
    month: UnitName;
    week: UnitName;
    day: UnitName;
    hour: UnitName;
    minute: UnitName;
  };
  months: MonthDef[];
  seasons: SeasonDef[];
  week: WeekDef;
  daySubdivision: DaySubdivision;
  leapRule: LeapRule;
  today: TodayDate | null;
  /** Legacy free-text "today" from the old format. */
  currentText: string;
}

export const DEFAULT_UNITS = {
  era: { singular: "Era", plural: "Eras" },
  year: { singular: "Ano", plural: "Anos" },
  season: { singular: "Estação", plural: "Estações" },
  month: { singular: "Mês", plural: "Meses" },
  week: { singular: "Semana", plural: "Semanas" },
  day: { singular: "Dia", plural: "Dias" },
  hour: { singular: "Hora", plural: "Horas" },
  minute: { singular: "Minuto", plural: "Minutos" },
} as const;

export const DEFAULT_WEEK: WeekDef = {
  daysPerWeek: 7,
  dayNames: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
};

export const DEFAULT_DAY_SUB: DaySubdivision = {
  hoursPerDay: 24,
  minutesPerHour: 60,
};

export const DEFAULT_CALENDAR: WorldCalendar = {
  era: "",
  units: { ...DEFAULT_UNITS },
  months: [],
  seasons: [],
  week: { ...DEFAULT_WEEK, dayNames: [...DEFAULT_WEEK.dayNames] },
  daySubdivision: { ...DEFAULT_DAY_SUB },
  leapRule: { kind: "none" },
  today: null,
  currentText: "",
};

// ── parsing helpers ──────────────────────────────────────────────

function num(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function asUnitName(value: unknown, fallback: UnitName): UnitName {
  if (typeof value === "string") return { singular: value, plural: value + "s" };
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    return {
      singular: typeof v["singular"] === "string" ? v["singular"] : fallback.singular,
      plural: typeof v["plural"] === "string" ? v["plural"] : fallback.plural,
    };
  }
  return fallback;
}

function cloneDefaults(): WorldCalendar {
  return {
    ...DEFAULT_CALENDAR,
    units: { ...DEFAULT_UNITS },
    week: { ...DEFAULT_WEEK, dayNames: [...DEFAULT_WEEK.dayNames] },
    daySubdivision: { ...DEFAULT_DAY_SUB },
  };
}

/**
 * Reads a WorldCalendar out of the campaign settings blob.
 * Accepts both the old flat shape and the new structured shape.
 */
export function calendarOf(settings: unknown): WorldCalendar {
  const raw = ((settings ?? {}) as Record<string, unknown>)["calendar"];
  const value = (raw ?? {}) as Record<string, unknown>;

  // Detect old format: months is string[]
  const rawMonths = value["months"];
  const isOldFormat =
    Array.isArray(rawMonths) && (rawMonths as unknown[]).every((m) => typeof m === "string");

  if (isOldFormat) {
    const daysPerMonth = num(value["days_per_month"]) ?? 30;
    const months: MonthDef[] = (rawMonths as string[]).map((name) => ({ name, days: daysPerMonth }));
    return {
      ...cloneDefaults(),
      era: typeof value["era"] === "string" ? value["era"] : "",
      months,
      currentText: typeof value["current"] === "string" ? value["current"] : "",
    };
  }

  // New (or partial) format
  const unitsRaw = (value["units"] ?? {}) as Record<string, unknown>;
  const units = {
    era: asUnitName(unitsRaw["era"], DEFAULT_UNITS.era),
    year: asUnitName(unitsRaw["year"], DEFAULT_UNITS.year),
    season: asUnitName(unitsRaw["season"], DEFAULT_UNITS.season),
    month: asUnitName(unitsRaw["month"], DEFAULT_UNITS.month),
    week: asUnitName(unitsRaw["week"], DEFAULT_UNITS.week),
    day: asUnitName(unitsRaw["day"], DEFAULT_UNITS.day),
    hour: asUnitName(unitsRaw["hour"], DEFAULT_UNITS.hour),
    minute: asUnitName(unitsRaw["minute"], DEFAULT_UNITS.minute),
  };

  let months: MonthDef[];
  if (Array.isArray(rawMonths)) {
    months = (rawMonths as unknown[]).map((m) => {
      if (typeof m === "string") return { name: m, days: 30 };
      const mo = m as Record<string, unknown>;
      return { name: String(mo["name"] ?? ""), days: num(mo["days"]) ?? 30 };
    });
  } else {
    months = [];
  }

  const seasonsRaw = value["seasons"];
  const seasons: SeasonDef[] = Array.isArray(seasonsRaw)
    ? (seasonsRaw as unknown[]).map((s) => {
        const so = s as Record<string, unknown>;
        return {
          name: String(so["name"] ?? ""),
          subtitle: String(so["subtitle"] ?? ""),
          months: Array.isArray(so["months"]) ? (so["months"] as unknown[]).map(Number) : [],
        };
      })
    : [];

  const weekRaw = (value["week"] ?? {}) as Record<string, unknown>;
  const week: WeekDef = {
    daysPerWeek: num(weekRaw["daysPerWeek"]) ?? DEFAULT_WEEK.daysPerWeek,
    dayNames: Array.isArray(weekRaw["dayNames"]) ? (weekRaw["dayNames"] as unknown[]).map(String) : [...DEFAULT_WEEK.dayNames],
  };

  const daySubRaw = (value["daySubdivision"] ?? {}) as Record<string, unknown>;
  const daySubdivision: DaySubdivision = {
    hoursPerDay: num(daySubRaw["hoursPerDay"]) ?? DEFAULT_DAY_SUB.hoursPerDay,
    minutesPerHour: num(daySubRaw["minutesPerHour"]) ?? DEFAULT_DAY_SUB.minutesPerHour,
  };

  const leapRaw = value["leapRule"] as Record<string, unknown> | undefined;
  let leapRule: LeapRule = { kind: "none" };
  if (leapRaw && typeof leapRaw === "object") {
    const lk = String(leapRaw["kind"] ?? "none");
    if (lk === "gregorian") {
      leapRule = { kind: "gregorian" };
    } else if (lk === "block") {
      leapRule = {
        kind: "block",
        block: num(leapRaw["block"]) ?? 4,
        years: Array.isArray(leapRaw["years"]) ? (leapRaw["years"] as unknown[]).map(Number) : [],
        month: num(leapRaw["month"]) ?? 0,
        extraDays: num(leapRaw["extraDays"]) ?? 1,
      };
    }
  }

  const todayRaw = value["today"] as Record<string, unknown> | null | undefined;
  let today: TodayDate | null = null;
  if (todayRaw && typeof todayRaw === "object") {
    const y = num(todayRaw["year"]);
    const mo = num(todayRaw["month"]);
    const d = num(todayRaw["day"]);
    if (y !== null && mo !== null && d !== null) {
      today = {
        year: y,
        month: mo,
        day: d,
        hour: num(todayRaw["hour"]) ?? 0,
        minute: num(todayRaw["minute"]) ?? 0,
      };
    }
  }

  return {
    era: typeof value["era"] === "string" ? value["era"] : "",
    units,
    months,
    seasons,
    week,
    daySubdivision,
    leapRule,
    today,
    currentText: typeof value["current"] === "string" ? value["current"] : "",
  };
}

// ── calendar math ─────────────────────────────────────────────────

export function isLeapYear(calendar: WorldCalendar, year: number): boolean {
  const { leapRule } = calendar;
  switch (leapRule.kind) {
    case "none":
      return false;
    case "gregorian":
      return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    case "block": {
      // 1-based position within the block: cycle 10 of 10 → position 10, not 0.
      const position = (((year - 1) % leapRule.block) + leapRule.block) % leapRule.block + 1;
      return leapRule.years.includes(position);
    }
  }
}

export function monthLength(calendar: WorldCalendar, monthIndex: number, year: number): number {
  const month = calendar.months[monthIndex];
  if (!month) return 30;
  let days = month.days > 0 ? month.days : 30;
  if (calendar.leapRule.kind === "block" && calendar.leapRule.month === monthIndex && isLeapYear(calendar, year)) {
    days += calendar.leapRule.extraDays;
  }
  if (calendar.leapRule.kind === "gregorian" && monthIndex === 1 && isLeapYear(calendar, year)) {
    days += 1;
  }
  return days;
}

export function daysInYear(calendar: WorldCalendar, year: number): number {
  return calendar.months.reduce((sum, _, i) => sum + monthLength(calendar, i, year), 0);
}

export function seasonOfMonth(calendar: WorldCalendar, monthIndex: number): SeasonDef | null {
  return calendar.seasons.find((s) => s.months.includes(monthIndex)) ?? null;
}

/** Returns 0-based day-of-week index, or -1 when the calendar has no week. */
export function dayOfWeek(calendar: WorldCalendar, year: number, month: number, day: number): number {
  if (calendar.week.daysPerWeek < 1) return -1;
  const monthIdx = month - 1;
  let total = 0;
  for (let y = 0; y < year; y++) total += daysInYear(calendar, y);
  for (let m = 0; m < monthIdx; m++) total += monthLength(calendar, m, year);
  total += day - 1;
  const dpw = calendar.week.daysPerWeek;
  return ((total % dpw) + dpw) % dpw;
}

// ── dates ────────────────────────────────────────────────────────

export interface WorldDate {
  year: number;
  /** 1-based month index */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function compareWorldDates(a: WorldDate, b: WorldDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day || a.hour - b.hour || a.minute - b.minute;
}

export function formatWorldDate(calendar: WorldCalendar, date: Partial<WorldDate>): string {
  const u = calendar.units;
  const parts: string[] = [];
  if (date.day) parts.push(String(date.day));
  if (date.month) {
    const monthDef = calendar.months[date.month - 1];
    if (monthDef) parts.push(monthDef.name);
  }
  const yearPart: string[] = [];
  if (date.year) yearPart.push(`${u.year.singular} ${date.year}`);
  const stamp = [parts.join(" "), yearPart.join(" ")].filter(Boolean).join(", ");
  const era = calendar.era;
  return [stamp, era].filter(Boolean).join(" · ") || "Undated";
}

/**
 * Returns `null` if valid, or an error message using the campaign's canonical
 * unit names.
 */
export function validateWorldDate(
  calendar: WorldCalendar,
  date: { year?: number; month: number; day: number; hour?: number; minute?: number },
): string | null {
  const u = calendar.units;
  const monthIdx = date.month - 1;
  if (monthIdx < 0 || monthIdx >= calendar.months.length) {
    return `${u.month.singular} inválido`;
  }
  const maxDay = monthLength(calendar, monthIdx, date.year ?? 0);
  const monthDef = calendar.months[monthIdx];
  if (date.day < 1 || date.day > maxDay) {
    return `${u.day.singular} deve estar entre 1 e ${maxDay} em ${monthDef?.name ?? ""}`;
  }
  if (date.hour !== undefined && (date.hour < 0 || date.hour >= calendar.daySubdivision.hoursPerDay)) {
    return `${u.hour.singular} deve estar entre 0 e ${calendar.daySubdivision.hoursPerDay - 1}`;
  }
  if (date.minute !== undefined && (date.minute < 0 || date.minute >= calendar.daySubdivision.minutesPerHour)) {
    return `${u.minute.singular} deve estar entre 0 e ${calendar.daySubdivision.minutesPerHour - 1}`;
  }
  return null;
}

// ── event helpers ─────────────────────────────────────────────────

export function eventOrder(
  row: { data?: unknown },
  calendar: WorldCalendar,
): [number, number, number, number, number] {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const year = num(data["year"]) ?? Number.POSITIVE_INFINITY;
  const rawMonth = String(data["month"] ?? "").trim();
  const byName = calendar.months.findIndex(
    (m) => m.name.toLowerCase() === rawMonth.toLowerCase(),
  );
  const month = byName >= 0 ? byName + 1 : num(rawMonth) ?? 0;
  const day = num(data["day"]) ?? 0;
  const hour = num(data["hour"]) ?? 0;
  const minute = num(data["minute"]) ?? 0;
  return [year, month, day, hour, minute];
}

// ── presets ───────────────────────────────────────────────────────

export const GREGORIAN_PRESET: WorldCalendar = {
  era: "DC",
  units: { ...DEFAULT_UNITS },
  months: [
    { name: "Janeiro", days: 31 },
    { name: "Fevereiro", days: 28 },
    { name: "Março", days: 31 },
    { name: "Abril", days: 30 },
    { name: "Maio", days: 31 },
    { name: "Junho", days: 30 },
    { name: "Julho", days: 31 },
    { name: "Agosto", days: 31 },
    { name: "Setembro", days: 30 },
    { name: "Outubro", days: 31 },
    { name: "Novembro", days: 30 },
    { name: "Dezembro", days: 31 },
  ],
  seasons: [
    { name: "Verão", subtitle: "", months: [11, 0, 1] },
    { name: "Outono", subtitle: "", months: [2, 3, 4] },
    { name: "Inverno", subtitle: "", months: [5, 6, 7] },
    { name: "Primavera", subtitle: "", months: [8, 9, 10] },
  ],
  week: { daysPerWeek: 7, dayNames: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] },
  daySubdivision: { hoursPerDay: 24, minutesPerHour: 60 },
  leapRule: { kind: "gregorian" },
  today: null,
  currentText: "",
};

/**
 * Nadrel calendar preset (used in tests; no UI button).
 * 8 months, 4 quartos, 320 rotas per ciclo (321 in leap cycles),
 * rota = 4 quartos = 16 partes, leap in cycles 4/7/10 of each block of 10.
 */
export const NADREL_PRESET: WorldCalendar = {
  era: "",
  units: {
    era: { singular: "Era", plural: "Eras" },
    year: { singular: "Ciclo", plural: "Ciclos" },
    season: { singular: "Quarto", plural: "Quartos" },
    month: { singular: "Mês", plural: "Meses" },
    week: { singular: "Semana", plural: "Semanas" },
    day: { singular: "Rota", plural: "Rotas" },
    hour: { singular: "Quarto", plural: "Quartos" },
    minute: { singular: "Parte", plural: "Partes" },
  },
  months: [
    { name: "Mês da Geada", days: 44 },
    { name: "Mês do Gelo", days: 44 },
    { name: "Mês do Degelo", days: 42 },
    { name: "Mês das Cheias", days: 38 },
    { name: "Mês das Chuvas", days: 36 },
    { name: "Mês das Tormentas", days: 36 },
    { name: "Mês das Névoas", days: 38 },
    { name: "Mês do Orvalho", days: 42 },
  ],
  seasons: [
    { name: "Quarto da Geada", subtitle: "Frio que preserva", months: [0, 1] },
    { name: "Quarto do Degelo", subtitle: "O fluir renova", months: [2, 3] },
    { name: "Quarto das Chuvas", subtitle: "", months: [4, 5] },
    { name: "Quarto das Névoas", subtitle: "", months: [6, 7] },
  ],
  week: { daysPerWeek: 0, dayNames: [] },
  daySubdivision: { hoursPerDay: 4, minutesPerHour: 4 },
  leapRule: { kind: "block", block: 10, years: [4, 7, 10], month: 5, extraDays: 1 },
  today: null,
  currentText: "",
};
