import { supabase } from "@/integrations/supabase/client";
import { AVIF_MIME, convertToAvif } from "@/lib/image-avif";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type MapRow = Tables<"maps">;
export type MapObjectRow = Tables<"map_objects">;

export const MAP_BUCKET = "maps";
export const MAP_MAX_BYTES = 25 * 1024 * 1024;
export const MAP_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"];

export type GridType = "square" | "hex" | "none";

/** Grid geometry needed by the pure helpers below. */
export interface GridSpec {
  grid_type: string;
  grid_size: number;
  grid_offset_x: number;
  grid_offset_y: number;
  unit_per_cell: number;
  unit_name: string;
}

export function validateMapFile(file: { type: string; size: number; name: string }): string | null {
  const type = (file.type || "").toLowerCase();
  const byExtension = /\.(png|jpe?g|webp|avif)$/i.test(file.name);
  if (!MAP_TYPES.includes(type) && !byExtension) return "Use a PNG, JPEG, WebP or AVIF image.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAP_MAX_BYTES) {
    return `Image is too large (max ${Math.round(MAP_MAX_BYTES / 1024 / 1024)} MB).`;
  }
  return null;
}

/** Map images live under `<user id>/<campaign id>/…`, which is what RLS checks. */
export function mapImagePathFor(userId: string, campaignId: string, fileName: string) {
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? "png").toLowerCase();
  return `${userId}/${campaignId}/${crypto.randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
}

const HEX_W = Math.sqrt(3) / 2; // pointy-top hex: horizontal spacing factor

/** Pixel position (on the unscaled image) of the centre of cell (cx, cy). */
export function cellToPixel(grid: GridSpec, cx: number, cy: number): { x: number; y: number } {
  const s = grid.grid_size;
  if (grid.grid_type === "hex") {
    const rowOffset = Math.abs(Math.round(cy)) % 2 === 1 ? s * HEX_W * 0.5 : 0;
    return {
      x: grid.grid_offset_x + cx * s * HEX_W + rowOffset + (s * HEX_W) / 2,
      y: grid.grid_offset_y + cy * s * 0.75 + s / 2,
    };
  }
  return { x: grid.grid_offset_x + (cx + 0.5) * s, y: grid.grid_offset_y + (cy + 0.5) * s };
}

/** Nearest cell for a pixel position on the unscaled image. */
export function pixelToCell(grid: GridSpec, px: number, py: number): { x: number; y: number } {
  const s = grid.grid_size || 1;
  if (grid.grid_type === "none") {
    return { x: (px - grid.grid_offset_x) / s - 0.5, y: (py - grid.grid_offset_y) / s - 0.5 };
  }
  if (grid.grid_type === "hex") {
    const approxRow = Math.round((py - grid.grid_offset_y - s / 2) / (s * 0.75));
    let best = { x: 0, y: 0 };
    let bestDist = Infinity;
    for (let r = approxRow - 1; r <= approxRow + 1; r += 1) {
      const rowOffset = Math.abs(r) % 2 === 1 ? s * HEX_W * 0.5 : 0;
      const c = Math.round((px - grid.grid_offset_x - rowOffset - (s * HEX_W) / 2) / (s * HEX_W));
      for (const cc of [c - 1, c, c + 1]) {
        const p = cellToPixel(grid, cc, r);
        const d = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = { x: cc, y: r };
        }
      }
    }
    return best;
  }
  return {
    x: Math.floor((px - grid.grid_offset_x) / s),
    y: Math.floor((py - grid.grid_offset_y) / s),
  };
}

function hexToCube(col: number, row: number) {
  const x = col - (row - (Math.abs(row) % 2)) / 2;
  const z = row;
  return { x, y: -x - z, z };
}

/**
 * Distance between two cells in map units.
 * Square grids count a diagonal as one cell (Chebyshev), hex grids use the
 * standard cube distance. `none` falls back to straight-line distance.
 */
export function cellDistance(
  grid: GridSpec,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const per = grid.unit_per_cell || 1;
  if (grid.grid_type === "hex") {
    const ca = hexToCube(Math.round(a.x), Math.round(a.y));
    const cb = hexToCube(Math.round(b.x), Math.round(b.y));
    const cells = Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z));
    return cells * per;
  }
  if (grid.grid_type === "none") {
    return Math.hypot(a.x - b.x, a.y - b.y) * per;
  }
  return Math.max(Math.abs(Math.round(a.x - b.x)), Math.abs(Math.round(a.y - b.y))) * per;
}

export function formatDistance(grid: GridSpec, value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${grid.unit_name}`;
}

/** Unscaled token bounds; the map transform scales these with the grid and image.
 *  The token is a circle sized to sit clearly inside its cell — for hex grids
 *  that means ~80% of the inscribed circle (flat-to-flat width), so it never
 *  spills over the hex edges. */
export function tokenDimensions(grid: GridSpec, cells = 1) {
  const scale = Number.isFinite(cells) && cells > 0 ? cells : 1;
  const cell = (grid.grid_size || 50) * scale;
  const inscribed = grid.grid_type === "hex" ? cell * HEX_W : cell;
  const diameter = inscribed * 0.8;
  return { width: diameter, height: diameter, diameter };
}

/* ---------------------------------------------------------------- data */

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export async function listMaps(campaignId: string): Promise<MapRow[]> {
  return unwrap(
    await supabase
      .from("maps")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true }),
  );
}

export async function createMap(input: TablesInsert<"maps">): Promise<MapRow> {
  return unwrap(await supabase.from("maps").insert(input).select("*").single());
}

export async function updateMap(id: string, patch: TablesUpdate<"maps">): Promise<MapRow> {
  return unwrap(await supabase.from("maps").update(patch).eq("id", id).select("*").single());
}

export async function deleteMap(id: string): Promise<void> {
  const { error } = await supabase.from("maps").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMapObjects(mapId: string): Promise<MapObjectRow[]> {
  return unwrap(
    await supabase
      .from("map_objects")
      .select("*")
      .eq("map_id", mapId)
      .order("created_at", { ascending: true }),
  );
}

export async function createMapObject(input: TablesInsert<"map_objects">): Promise<MapObjectRow> {
  return unwrap(await supabase.from("map_objects").insert(input).select("*").single());
}

export async function updateMapObject(
  id: string,
  patch: TablesUpdate<"map_objects">,
): Promise<MapObjectRow> {
  return unwrap(await supabase.from("map_objects").update(patch).eq("id", id).select("*").single());
}

export async function deleteMapObject(id: string): Promise<void> {
  const { error } = await supabase.from("map_objects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function uploadMapImage(campaignId: string, file: File): Promise<string> {
  const invalid = validateMapFile(file);
  if (invalid) throw new Error(invalid);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You need to be signed in to upload a map.");
  const avif = await convertToAvif(file, { maxDimension: 4096 });
  const path = mapImagePathFor(auth.user.id, campaignId, avif.name);
  const { error } = await supabase.storage
    .from(MAP_BUCKET)
    .upload(path, avif, { cacheControl: "3600", upsert: false, contentType: AVIF_MIME });
  if (error) throw new Error(error.message);
  return path;
}

export async function mapImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(MAP_BUCKET)
    .createSignedUrl(path, 60 * 60 * 8);
  if (error) return null;
  return data?.signedUrl ?? null;
}
