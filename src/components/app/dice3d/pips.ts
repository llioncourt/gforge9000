import * as THREE from "three";

const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [-1, 1],
    [0, 0],
    [1, -1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ],
};

const cache = new Map<number, THREE.CanvasTexture>();

/** Procedural pip face — no external art assets. */
export function pipTexture(value: number): THREE.CanvasTexture {
  const cached = cache.get(value);
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "#f6efdf");
  bg.addColorStop(1, "#ddd2b8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(60,48,30,0.35)";
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, size - 28, size - 28);

  ctx.fillStyle = "#2a2118";
  const step = size * 0.26;
  const center = size / 2;
  const radius = size * 0.075;
  for (const [cx, cy] of PIP_LAYOUTS[value] ?? []) {
    ctx.beginPath();
    ctx.arc(center + cx * step, center + cy * step, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(value, texture);
  return texture;
}

export function disposePipTextures() {
  for (const texture of cache.values()) texture.dispose();
  cache.clear();
}

/** Box material order is +X, -X, +Y, -Y, +Z, -Z. */
export const BOX_FACE_VALUES = [3, 4, 1, 6, 2, 5];
