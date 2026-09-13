import { describe, expect, it } from "vitest";
import { calendarOf, eventOrder } from "@/components/lore/timeline-panel";

const row = (data: Record<string, unknown>) => ({ data }) as never;

describe("in-world calendar", () => {
  it("falls back to sane defaults", () => {
    expect(calendarOf(null)).toEqual({ era: "", months: [], days_per_month: 30, current: "" });
  });

  it("reads a stored calendar", () => {
    const cal = calendarOf({ calendar: { era: "Third Age", months: ["A", "B"], days_per_month: 28 } });
    expect(cal.era).toBe("Third Age");
    expect(cal.months).toEqual(["A", "B"]);
    expect(cal.days_per_month).toBe(28);
  });
});

describe("event ordering", () => {
  const months = ["Frostmoon", "Seedtide", "Highsun"];

  it("orders by custom month names", () => {
    expect(eventOrder(row({ year: "998", month: "Highsun", day: "3" }), months)).toEqual([998, 3, 3]);
  });

  it("accepts numeric months", () => {
    expect(eventOrder(row({ year: "5", month: "2", day: "1" }), months)).toEqual([5, 2, 1]);
  });

  it("pushes undated events to the end", () => {
    const [year] = eventOrder(row({}), months);
    expect(year).toBe(Number.POSITIVE_INFINITY);
  });
});
