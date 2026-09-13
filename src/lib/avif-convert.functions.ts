import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Served as a static asset from public/wasm so the binary never enters the
// server bundle; fetched over HTTP from the app's own origin at call time.
const AVIF_ENCODER_WASM_PATH = "/wasm/avif_enc.wasm";

/**
 * Server-side AVIF encoding fallback.
 *
 * The browser always decodes and resizes the image (canvas), so this function
 * only receives raw RGBA pixels and encodes them to AVIF. It exists for
 * browsers/environments where neither the native canvas encoder nor the
 * client-side WASM encoder can run. The encoder WASM is loaded over HTTP from
 * the app's own origin, which works both in dev and in the edge runtime.
 */

type EncodeFn = (
  data: Uint8Array,
  width: number,
  height: number,
  options: Record<string, unknown>,
) => Promise<ArrayBuffer>;

let encoderPromise: Promise<EncodeFn> | undefined;

async function loadEncoder(origin: string): Promise<EncodeFn> {
  encoderPromise ??= (async () => {
    const wasmUrl = new URL(AVIF_ENCODER_WASM_PATH, origin);
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error("Could not load the AVIF encoder.");
    const wasmModule = await WebAssembly.compile(await response.arrayBuffer());
    const mod = await import("@jsquash/avif/encode");
    // init() primes the module singleton with our pre-loaded WASM, so the
    // default export never tries to fetch the codec itself.
    await mod.init(wasmModule as WebAssembly.Module);
    const encode = mod.default as unknown as (
      data: { data: Uint8ClampedArray; width: number; height: number },
      options: Record<string, unknown>,
    ) => Promise<ArrayBuffer>;
    return async (raw, width, height, options) =>
      encode({ data: new Uint8ClampedArray(raw.buffer, 0, width * height * 4), width, height }, options);
  })();
  try {
    return await encoderPromise;
  } catch (error) {
    encoderPromise = undefined;
    throw error;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const MAX_DIMENSION = 4096;
const MAX_PIXELS = MAX_DIMENSION * MAX_DIMENSION;

export const convertImageToAvif = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const width = Number(data.get("width"));
    const height = Number(data.get("height"));
    const quality = Math.min(100, Math.max(10, Number(data.get("quality")) || 62));
    const pixels = data.get("pixels");

    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error("Invalid image dimensions.");
    }
    if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
      throw new Error("Image is too large.");
    }
    if (!(pixels instanceof File) || pixels.size !== width * height * 4) {
      throw new Error("Invalid image data.");
    }

    const raw = new Uint8Array(await pixels.arrayBuffer());
    const encode = await loadEncoder(new URL(getRequest().url).origin);
    const output = await encode(raw, width, height, { quality, speed: 8 });
    if (!output || output.byteLength === 0) throw new Error("AVIF encoding failed.");

    return { base64: toBase64(new Uint8Array(output)), mime: "image/avif" };
  });
