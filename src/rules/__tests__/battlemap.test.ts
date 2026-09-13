import { describe, expect, it } from "vitest";
import {
  cellDistance,
  cellToPixel,
  formatDistance,
  tokenDimensions,
  mapImagePathFor,
  pixelToCell,
  validateMapFile,
  type GridSpec,
} from "@/lib/battlemap";

const square: GridSpec = {
  grid_type: "square",
  grid_size: 50,
  grid_offset_x: 0,
  grid_offset_y: 0,
  unit_per_cell: 1,
  unit_name: "yd",
};

const hex: GridSpec = { ...square, grid_type: "hex" };

describe("square grid", () => {
  it("puts a cell centre in the middle of the cell", () => {
    expect(cellToPixel(square, 0, 0)).toEqual({ x: 25, y: 25 });
    expect(cellToPixel(square, 2, 1)).toEqual({ x: 125, y: 75 });
  });

  it("snaps a pixel back to its cell", () => {
    expect(pixelToCell(square, 26, 24)).toEqual({ x: 0, y: 0 });
    expect(pixelToCell(square, 149, 51)).toEqual({ x: 2, y: 1 });
  });

  it("honours the grid offset", () => {
    const offset = { ...square, grid_offset_x: 10, grid_offset_y: 20 };
    expect(cellToPixel(offset, 0, 0)).toEqual({ x: 35, y: 45 });
    expect(pixelToCell(offset, 35, 45)).toEqual({ x: 0, y: 0 });
  });

  it("counts a diagonal as one cell and scales by distance per cell", () => {
    expect(cellDistance(square, { x: 0, y: 0 }, { x: 3, y: 3 })).toBe(3);
    expect(cellDistance({ ...square, unit_per_cell: 2 }, { x: 0, y: 0 }, { x: 0, y: 4 })).toBe(8);
  });
});

describe("hex grid", () => {
  it("offsets odd rows by half a cell", () => {
    const even = cellToPixel(hex, 0, 0);
    const odd = cellToPixel(hex, 0, 1);
    expect(odd.x - even.x).toBeCloseTo((50 * Math.sqrt(3)) / 2 / 2, 5);
    expect(odd.y - even.y).toBeCloseTo(37.5, 5);
  });

  it("round-trips a cell through pixels", () => {
    for (const cell of [
      { x: 0, y: 0 },
      { x: 3, y: 2 },
      { x: 5, y: 7 },
    ]) {
      const p = cellToPixel(hex, cell.x, cell.y);
      expect(pixelToCell(hex, p.x, p.y)).toEqual(cell);
    }
  });

  it("uses cube distance", () => {
    expect(cellDistance(hex, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(cellDistance(hex, { x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
    expect(cellDistance(hex, { x: 0, y: 0 }, { x: 0, y: 2 })).toBe(2);
  });
});

describe("gridless maps", () => {
  it("measures straight-line distance", () => {
    const free: GridSpec = { ...square, grid_type: "none" };
    expect(cellDistance(free, { x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("helpers", () => {
  it("fits a one-cell token inside a pointy-top hex", () => {
    expect(tokenDimensions(hex, 1)).toEqual({
      width: 50 * Math.sqrt(3) / 2,
      height: 50,
      diameter: 50 * Math.sqrt(3) / 2,
    });
  });

  it("keeps square tokens sized to their occupied cells", () => {
    expect(tokenDimensions(square, 2)).toEqual({ width: 100, height: 100, diameter: 100 });
  });

  it("formats distance to one decimal", () => {
    expect(formatDistance(square, 3.14159)).toBe("3.1 yd");
  });

  it("rejects the wrong kind of file", () => {
    expect(validateMapFile({ name: "map.png", type: "image/png", size: 1000 })).toBeNull();
    expect(validateMapFile({ name: "map.pdf", type: "application/pdf", size: 10 })).toMatch(/PNG/);
    expect(validateMapFile({ name: "map.png", type: "image/png", size: 0 })).toMatch(/empty/);
    expect(
      validateMapFile({ name: "map.png", type: "image/png", size: 40 * 1024 * 1024 }),
    ).toMatch(/too large/);
  });

  it("stores map images under user and campaign folders", () => {
    const path = mapImagePathFor("11111111-1111-1111-1111-111111111111", "camp", "Battle.JPEG");
    expect(path.startsWith("11111111-1111-1111-1111-111111111111/camp/")).toBe(true);
    expect(path.endsWith(".jpg")).toBe(true);
  });
});
