/**
 * Single place where every uploaded image becomes AVIF.
 * Storage only ever receives `image/avif`. Conversion happens in the browser
 * when possible, and falls back to a server-side converter when the browser
 * cannot encode AVIF (no native encoder, WASM blocked, undecodable format).
 */

import { convertImageToAvif } from "@/lib/avif-convert.functions";

export const AVIF_MIME = "image/avif";
export const AVIF_MAX_DIMENSION = 2048;
export const AVIF_QUALITY = 0.62;

export function isAvifFile(file: { type?: string; name?: string }): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === AVIF_MIME) return true;
  return /\.avif$/i.test(file.name || "");
}

export function isImageFile(file: { type?: string; name?: string }): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|heic|heif)$/i.test(file.name || "");
}

/** `portrait.PNG` -> `portrait.avif` */
export function avifFileName(name: string): string {
  const base = (name || "image").replace(/\.[a-z0-9]+$/i, "");
  return `${base || "image"}.avif`;
}

/** Scales down so neither side exceeds `max`, keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  max = AVIF_MAX_DIMENSION,
): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const ratio = Math.min(max / width, max / height);
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

async function canvasFromFile(file: Blob, max: number) {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process images.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return { canvas, ctx, width, height };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Converts any browser-decodable image to AVIF.
 * Tries the native canvas encoder first, then a WASM encoder as a fallback.
 */
export async function convertToAvif(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  if (isAvifFile(file)) return file;
  const max = opts.maxDimension ?? AVIF_MAX_DIMENSION;
  const quality = opts.quality ?? AVIF_QUALITY;

  try {
    return await convertInBrowser(file, max, quality);
  } catch {
    return convertOnServer(file, max, quality);
  }
}

async function convertInBrowser(file: File, max: number, quality: number): Promise<File> {
  const { canvas, ctx, width, height } = await canvasFromFile(file, max);

  const native = await canvasToBlob(canvas, AVIF_MIME, quality).catch(() => null);
  if (native && native.type === AVIF_MIME && native.size > 0) {
    return new File([native], avifFileName(file.name), { type: AVIF_MIME });
  }

  const mod = await import("@jsquash/avif");
  const encode = mod.encode as unknown as (
    data: ImageData,
    opts?: Record<string, number>,
  ) => Promise<ArrayBuffer>;
  const imageData = ctx.getImageData(0, 0, width, height);
  const buffer = await encode(imageData, { cqLevel: 30, speed: 7 });
  return new File([buffer], avifFileName(file.name), { type: AVIF_MIME });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function convertOnServer(file: File, max: number, quality: number): Promise<File> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("maxDimension", String(max));
  formData.set("quality", String(Math.round(quality * 100)));
  const result = await convertImageToAvif({ data: formData });
  const bytes = base64ToBytes(result.base64);
  return new File([bytes.buffer as ArrayBuffer], avifFileName(file.name), { type: AVIF_MIME });
}

/** Converts images to AVIF; leaves non-images untouched. */
export async function toAvifIfImage(file: File): Promise<File> {
  if (!isImageFile(file)) return file;
  return convertToAvif(file);
}
