import { supabase } from "@/integrations/supabase/client";
import { currentUser } from "@/lib/current-user";

export const MODEL_BUCKET = "models";
export const MODEL_MAX_BYTES = 50 * 1024 * 1024;

/** Pure validation so it can be unit-tested without a network. */
export function validateModelFile(file: { size: number; name: string }): string | null {
  if (!/\.(glb)$/i.test(file.name)) return "Use a .glb file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MODEL_MAX_BYTES) {
    return `File is too large (max ${Math.round(MODEL_MAX_BYTES / 1024 / 1024)} MB).`;
  }
  return null;
}

/** Models live under `<user id>/<character id>/…`, which is what RLS checks. */
export function modelPathFor(userId: string, characterId: string) {
  return `${userId}/${characterId}/${crypto.randomUUID()}.glb`;
}

export async function uploadModel(characterId: string, file: File): Promise<string> {
  const invalid = validateModelFile(file);
  if (invalid) throw new Error(invalid);
  const { data: auth } = await currentUser();
  if (!auth.user) throw new Error("You need to be signed in to upload a model.");
  const path = modelPathFor(auth.user.id, characterId);
  const { error } = await supabase.storage
    .from(MODEL_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: "model/gltf-binary" });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeModel(path: string) {
  const { error } = await supabase.storage.from(MODEL_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function modelUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(MODEL_BUCKET)
    .createSignedUrl(path, 60 * 60 * 8);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Saved orientation of a character's 3D model (degrees + uniform scale). */
export type ModelTransform = { rx: number; ry: number; rz: number; scale: number };

export const DEFAULT_MODEL_TRANSFORM: ModelTransform = { rx: 0, ry: 0, rz: 0, scale: 1 };

/** Reads a stored jsonb value into a safe transform. */
export function parseModelTransform(value: unknown): ModelTransform {
  const v = (value ?? {}) as Partial<Record<keyof ModelTransform, unknown>>;
  const num = (x: unknown, fallback: number) =>
    typeof x === "number" && Number.isFinite(x) ? x : fallback;
  return {
    rx: num(v.rx, 0),
    ry: num(v.ry, 0),
    rz: num(v.rz, 0),
    scale: Math.min(4, Math.max(0.25, num(v.scale, 1))),
  };
}

/* ---- 3D viewer settings (kept three.js-free so the UI can stay lazy) ---- */

export type CameraView = "front" | "back" | "left" | "right" | "top" | "iso";

export type MaterialMode = "original" | "normal" | "clay" | "xray";

export type LightingPreset = "studio" | "dramatic" | "noir" | "sunset" | "flat";

export type BackdropMode = "graphite" | "ink" | "paper" | "void";

export type ModelInfo = {
  meshes: number;
  triangles: number;
  vertices: number;
  materials: number;
  animations: string[];
  size: { x: number; y: number; z: number };
};

export type ViewerApi = {
  setView: (view: CameraView) => void;
  screenshot: () => string | null;
};

export type ViewerSettings = {
  autoRotate: boolean;
  autoRotateSpeed: number;
  wireframe: boolean;
  materialMode: MaterialMode;
  grid: boolean;
  shadows: boolean;
  axes: boolean;
  boundingBox: boolean;
  lighting: LightingPreset;
  backdrop: BackdropMode;
  exposure: number;
  lightIntensity: number;
  fov: number;
  animation: string | null;
  animationPlaying: boolean;
  animationSpeed: number;
};

export const DEFAULT_VIEWER_SETTINGS: ViewerSettings = {
  autoRotate: true,
  autoRotateSpeed: 1.2,
  wireframe: false,
  materialMode: "original",
  grid: true,
  shadows: true,
  axes: false,
  boundingBox: false,
  lighting: "studio",
  backdrop: "graphite",
  exposure: 1,
  lightIntensity: 1,
  fov: 45,
  animation: null,
  animationPlaying: true,
  animationSpeed: 1,
};
