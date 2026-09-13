import { createServerFn } from "@tanstack/react-start";

/**
 * Server-side image -> AVIF conversion.
 *
 * Used as a fallback when the browser cannot encode AVIF itself (no native
 * canvas encoder, WASM blocked, etc.). Decoding is done with WASM codecs that
 * run in the edge runtime — no native binaries involved.
 */

const MAX_INPUT_BYTES = 25 * 1024 * 1024;

type RawImage = { data: Uint8ClampedArray; width: number; height: number };

function fitWithinSize(width: number, height: number, max: number) {
  if (width <= max && height <= max) return { width, height };
  const ratio = Math.min(max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** Bilinear downscale so we never ship oversized originals. */
function resizeImageData(src: RawImage, targetWidth: number, targetHeight: number): RawImage {
  if (src.width === targetWidth && src.height === targetHeight) return src;
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const xRatio = src.width / targetWidth;
  const yRatio = src.height / targetHeight;
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(src.height - 1, (y + 0.5) * yRatio - 0.5);
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(src.width - 1, (x + 0.5) * xRatio - 0.5);
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      const di = (y * targetWidth + x) * 4;
      for (let c = 0; c < 4; c++) {
        const p00 = src.data[(y0 * src.width + x0) * 4 + c];
        const p10 = src.data[(y0 * src.width + x1) * 4 + c];
        const p01 = src.data[(y1 * src.width + x0) * 4 + c];
        const p11 = src.data[(y1 * src.width + x1) * 4 + c];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        out[di + c] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return { data: out, width: targetWidth, height: targetHeight };
}

async function decodeImage(buffer: ArrayBuffer, mime: string): Promise<RawImage> {
  if (mime === "image/jpeg" || mime === "image/jpg") {
    const { default: decode } = await import("@jsquash/jpeg/decode");
    return decode(buffer) as Promise<RawImage>;
  }
  if (mime === "image/png") {
    const { default: decode } = await import("@jsquash/png/decode");
    return decode(buffer) as Promise<RawImage>;
  }
  if (mime === "image/webp") {
    const { default: decode } = await import("@jsquash/webp/decode");
    return decode(buffer) as Promise<RawImage>;
  }
  throw new Error(`Unsupported image format: ${mime || "unknown"}`);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const convertImageToAvif = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("No image received.");
    if (file.size > MAX_INPUT_BYTES) throw new Error("Image is too large (max 25 MB).");

    const maxDimension = Math.min(4096, Math.max(64, Number(data.get("maxDimension")) || 2048));
    const quality = Math.min(100, Math.max(10, Number(data.get("quality")) || 62));

    const buffer = await file.arrayBuffer();
    const decoded = await decodeImage(buffer, (file.type || "").toLowerCase());
    const { width, height } = fitWithinSize(decoded.width, decoded.height, maxDimension);
    const pixels = resizeImageData(decoded, width, height);

    const { default: encode } = await import("@jsquash/avif/encode");
    const encoded = await encode(
      { data: pixels.data, width, height } as unknown as ImageData,
      { quality, speed: 8 },
    );
    return { base64: toBase64(new Uint8Array(encoded)), mime: "image/avif" };
  });
