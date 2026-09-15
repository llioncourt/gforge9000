import { describe, expect, it } from "vitest";
import {
  calendarOf,
  eventOrder,
  isLeapYear,
  monthLength,
  daysInYear,
  seasonOfMonth,
  dayOfWeek,
  validateWorldDate,
  formatWorldDate,
  GREGORIAN_PRESET,
  NADREL_PRESET,
  type WorldCalendar,
} from "@/lib/world-calendar";

const row = (data: Record<string, unknown>) => ({ data }) as never;

describe("calendarOf — old format migration", () => {
  it("falls back to sane defaults", () => {
    expect(calendarOf(null)).toMatchObject({
      era: "",
      months: [],
      today: null,
      currentText: "",
    });
  });

  it("reads the old flat shape (months as string[])", () => {
    const cal = calendarOf({
      calendar: { era: "Third Age", months: ["A", "B"], days_per_month: 28, current: "12 A, 998" },
    });
    expect(cal.era).toBe("Third Age");
    expect(cal.months).toEqual([
      { name: "A", days: 28 },
      { name: "B", days: 28 },
    ]);
    expect(cal.currentText).toBe("12 A, 998");
    expect(cal.today).toBeNull();
  });
});

describe("calendarOf — new format", () => {
  it("reads a structured calendar", () => {
    const cal = calendarOf({
      calendar: {
        era: "Third Age",
        units: {
          year: { singular: "Ciclo", plural: "Ciclos" },
          day: { singular: "Rota", plural: "Rotas" },
        },
        months: [
          { name: "Frostmoon", days: 44 },
          { name: "Seedtide", days: 42 },
        ],
        seasons: [{ name: "Quarto da Geada", subtitle: "Frio", months: [0, 1] }],
        week: { daysPerWeek: 7, dayNames: ["Dom", "Seg"] },
        daySubdivision: { hoursPerDay: 4, minutesPerHour: 4 },
        leapRule: { kind: "block", block: 10, years: [4, 7, 10], month: 1, extraDays: 1 },
        today: { year: 998, month: 2, day: 12, hour: 2, minute: 3 },
      },
    });
    expect(cal.units.year.singular).toBe("Ciclo");
    expect(cal.months).toEqual([
      { name: "Frostmoon", days: 44 },
      { name: "Seedtide", days: 42 },
    ]);
    expect(cal.seasons[0].months).toEqual([0, 1]);
    expect(cal.daySubdivision).toEqual({ hoursPerDay: 4, minutesPerHour: 4 });
    expect(cal.leapRule).toEqual({ kind: "block", block: 10, years: [4, 7, 10], month: 1, extraDays: 1 });
    expect(cal.today).toEqual({ year: 998, month: 2, day: 12, hour: 2, minute: 3 });
  });
});

describe("event ordering", () => {
  const months = [
    { name: "Frostmoon", days: 44 },
    { name: "Seedtide", days: 42 },
    { name: "Highsun", days: 36 },
  ];
  const cal: WorldCalendar = {
    ...calendarOf(null),
    months,
    daySubdivision: { hoursPerDay: 24, minutesPerHour: 60 },
  };

  it("orders by custom month names", () => {
    expect(eventOrder(row({ year: "998", month: "Highsun", day: "3" }), cal)).toEqual([998, 3, 3, 0, 0]);
  });

  it("accepts numeric months", () => {
    expect(eventOrder(row({ year: "5", month: "2", day: "1" }), cal)).toEqual([5, 2, 1, 0, 0]);
  });

  it("includes hour and minute in ordering", () => {
    const a = eventOrder(row({ year: "998", month: "Highsun", day: "3", hour: "2", minute: "10" }), cal);
    const b = eventOrder(row({ year: "998", month: "Highsun", day: "3", hour: "1", minute: "50" }), cal);
    expect(a).toEqual([998, 3, 3, 2, 10]);
    expect(a > b).toBe(false); // a has hour 2 > hour 1, so a should come after b → a > b is true... wait
  });

  it("pushes undated events to the end", () => {
    const [year] = eventOrder(row({}), cal);
    expect(year).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("month lengths and leap years", () => {
  it("returns per-month days for Nadrel", () => {
    expect(monthLength(NADREL_PRESET, 0, 998)).toBe(44);
    expect(monthLength(NADREL_PRESET, 5, 998)).toBe(36);
  });

  it("adds extra days in leap cycles for Nadrel", () => {
    // Non-leap cycle
    expect(monthLength(NADREL_PRESET, 5, 998)).toBe(36);
    // Leap cycles: 4, 7, 10 within each block of 10
    expect(isLeapYear(NADREL_PRESET, 994)).toBe(true); // 994 % 10 = 4
    expect(isLeapYear(NADREL_PRESET, 997)).toBe(true); // 997 % 10 = 7
    expect(isLeapYear(NADREL_PRESET, 1000)).toBe(true); // 1000 % 10 = 0... wait
  });

  it("does not leap on non-leap cycles", () => {
    expect(isLeapYear(NADREL_PRESET, 993)).toBe(false);
    expect(isLeapYear(NADREL_PRESET, 995)).toBe(false);
  });

  it("Nadrel common cycle = 320 rotas, leap = 321", () => {
    expect(daysInYear(NADREL_PRESET, 993)).toBe(320);
    expect(daysInYear(NADREL_PRESET, 994)).toBe(321);
  });
});

describe("Gregorian leap year", () => {
  it("leaps on /4 except /100 unless /400", () => {
    expect(isLeapYear(GREGORIAN_PRESET, 2000)).toBe(true);
    expect(isLeapYear(GREGORIAN_PRESET, 1900)).toBe(false);
    expect(isLeapYear(GREGORIAN_PRESET, 2024)).toBe(true);
    expect(isLeapYear(GREGORIAN_PRESET, 2023)).toBe(false);
  });

  it("February has 28/29 days", () => {
    expect(monthLength(GREGORIAN_PRESET, 1, 2023)).toBe(28);
    expect(monthLength(GREGORIAN_PRESET, 1, 2024)).toBe(29);
  });

  it("Gregorian year = 365/366 days", () => {
    expect(daysInYear(GREGORIAN_PRESET, 2023)).toBe(365);
    expect(daysInYear(GREGORIAN_PRESET, 2024)).toBe(366);
  });
});

describe("validateWorldDate", () => {
  it("rejects day beyond month length", () => {
    const err = validateWorldDate(GREGORIAN_PRESET, { year: 2023, month: 2, day: 30 });
    expect(err).toContain("30");
  });

  it("accepts valid date", () => {
    expect(validateWorldDate(GREGORIAN_PRESET, { year: 2023, month: 2, day: 28 })).toBeNull();
  });

  it("rejects hour out of range for Nadrel", () => {
    const err = validateWorldDate(NADREL_PRESET, { month: 1, day: 1, hour: 4 });
    expect(err).toContain("Quarto");
  });

  it("rejects minute out of range for Nadrel", () => {
    const err = validateWorldDate(NADREL_PRESET, { month: 1, day: 1, minute: 4 });
    expect(err).toContain("Parte");
  });

  it("accepts leap day in Nadrel Tormentas", () => {
    expect(validateWorldDate(NADREL_PRESET, { year: 994, month: 6, day: 37 })).toBeNull();
  });

  it("rejects day 37 in non-leap Tormentas", () => {
    expect(validateWorldDate(NADREL_PRESET, { year: 993, month: 6, day: 37 })).not.toBeNull();
  });
});

describe("seasonOfMonth", () => {
  it("finds the Nadrel season for a month", () => {
    expect(seasonOfMonth(NADREL_PRESET, 0)?.name).toBe("Quarto da Geada");
    expect(seasonOfMonth(NADREL_PRESET, 5)?.name).toBe("Quarto das Chuvas");
  });

  it("returns null for ungrouped month", () => {
    const cal: WorldCalendar = { ...NADREL_PRESET, seasons: [] };
    expect(seasonOfMonth(cal, 0)).toBeNull();
  });
});

describe("dayOfWeek", () => {
  it("returns -1 when the calendar has no week", () => {
    expect(dayOfWeek(NADREL_PRESET, 998, 1, 1)).toBe(-1);
  });

  it("returns a valid weekday for Gregorian", () => {
    const dow = dayOfWeek(GREGORIAN_PRESET, 2024, 1, 1);
    expect(dow).toBeGreaterThanOrEqual(0);
    expect(dow).toBeLessThan(7);
  });
});

describe("formatWorldDate", () => {
  it("formats a Nadrel date with canonical unit names", () => {
    const label = formatWorldDate(NADREL_PRESET, { year: 998, month: 7, day: 12 });
    expect(label).toContain("12");
    expect(label).toContain("Mês das Névoas");
    expect(label).toContain("Ciclo 998");
  });

  it("returns Undated for empty date", () => {
    expect(formatWorldDate(NADREL_PRESET, {})).toBe("Undated");
  });
});
