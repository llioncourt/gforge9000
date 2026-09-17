/**
 * Pure 3D d6 simulation + face mapping.
 *
 * This module contains NO rendering code so the face/result mapping can be
 * unit-tested independently. The renderer draws exactly the state produced
 * here, and the reported result is read back from the settled orientations —
 * the UI never invents a number that the dice do not show.
 */

export type Vec3 = [number, number, number];
/** Quaternion as [x, y, z, w]. */
export type Quat = [number, number, number, number];

export const DIE_SIZE = 1;
const HALF = DIE_SIZE / 2;

/** Local face normals and their pip values (opposite faces sum to 7). */
export const FACES: { normal: Vec3; value: number }[] = [
  { normal: [0, 1, 0], value: 1 },
  { normal: [0, 0, 1], value: 2 },
  { normal: [1, 0, 0], value: 3 },
  { normal: [-1, 0, 0], value: 4 },
  { normal: [0, 0, -1], value: 5 },
  { normal: [0, -1, 0], value: 6 },
];

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const l = Math.hypot(...axis) || 1;
  const s = Math.sin(angle / 2);
  return quatNormalize([
    (axis[0] / l) * s,
    (axis[1] / l) * s,
    (axis[2] / l) * s,
    Math.cos(angle / 2),
  ]);
}

export function rotateVec(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

/** Integrates an angular velocity (rad/s) into an orientation. */
export function integrateRotation(q: Quat, angVel: Vec3, dt: number): Quat {
  const speed = Math.hypot(...angVel);
  if (speed < 1e-6) return q;
  return quatNormalize(quatMul(quatFromAxisAngle(angVel, speed * dt), q));
}

/** Value of the face pointing most nearly upwards. */
export function topFaceValue(q: Quat): number {
  let best = FACES[0]!;
  let bestY = -Infinity;
  for (const face of FACES) {
    const y = rotateVec(q, face.normal)[1];
    if (y > bestY) {
      bestY = y;
      best = face;
    }
  }
  return best.value;
}

function nearestAxis(v: Vec3): Vec3 {
  const abs = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])];
  const i = abs.indexOf(Math.max(...abs));
  const out: Vec3 = [0, 0, 0];
  out[i as 0 | 1 | 2] = (v[i as 0 | 1 | 2] ?? 0) >= 0 ? 1 : -1;
  return out;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Snaps an orientation to the nearest axis-aligned resting orientation so a
 * settled die sits flat. The top face is preserved by construction.
 */
export function snapQuat(q: Quat): Quat {
  // Local axis currently pointing most upwards — this is the face the player
  // sees, so it is the one the snapped orientation must keep on top.
  let up: Vec3 = [0, 1, 0];
  let bestY = -Infinity;
  for (const face of FACES) {
    const y = rotateVec(q, face.normal)[1];
    if (y > bestY) {
      bestY = y;
      up = face.normal;
    }
  }
  // A second local axis, perpendicular to `up`, snapped to a horizontal world axis.
  let side: Vec3 = [1, 0, 0];
  let bestPerp = Infinity;
  for (const face of FACES) {
    const d = Math.abs(dot(face.normal, up));
    const w = rotateVec(q, face.normal);
    const score = d + (1 - Math.abs(w[0])) * 0.001;
    if (d < 0.5 && score < bestPerp) {
      bestPerp = score;
      side = face.normal;
    }
  }
  const sideWorldRaw = rotateVec(q, side);
  const sideWorld: Vec3 = nearestAxis([sideWorldRaw[0], 0, sideWorldRaw[2]]);
  const third = cross(up, side);
  const thirdWorld = cross([0, 1, 0], sideWorld);

  // Rotation matrix mapping the local frame {side, up, third} onto
  // {sideWorld, +Y, thirdWorld}: M = imgs * locals^T.
  const locals: Vec3[] = [side, up, third];
  const imgs: Vec3[] = [sideWorld, [0, 1, 0], thirdWorld];
  const m: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += imgs[k]![r]! * locals[k]![c]!;
      m[r]![c] = sum;
    }
  }
  const at = (r: number, c: number) => m[r]![c]!;
  const trace = at(0, 0) + at(1, 1) + at(2, 2);
  let out: Quat;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    out = [
      (at(2, 1) - at(1, 2)) / s,
      (at(0, 2) - at(2, 0)) / s,
      (at(1, 0) - at(0, 1)) / s,
      0.25 * s,
    ];
  } else if (at(0, 0) > at(1, 1) && at(0, 0) > at(2, 2)) {
    const s = Math.sqrt(1 + at(0, 0) - at(1, 1) - at(2, 2)) * 2;
    out = [
      0.25 * s,
      (at(0, 1) + at(1, 0)) / s,
      (at(0, 2) + at(2, 0)) / s,
      (at(2, 1) - at(1, 2)) / s,
    ];
  } else if (at(1, 1) > at(2, 2)) {
    const s = Math.sqrt(1 + at(1, 1) - at(0, 0) - at(2, 2)) * 2;
    out = [
      (at(0, 1) + at(1, 0)) / s,
      0.25 * s,
      (at(1, 2) + at(2, 1)) / s,
      (at(0, 2) - at(2, 0)) / s,
    ];
  } else {
    const s = Math.sqrt(1 + at(2, 2) - at(0, 0) - at(1, 1)) * 2;
    out = [
      (at(0, 2) + at(2, 0)) / s,
      (at(1, 2) + at(2, 1)) / s,
      0.25 * s,
      (at(1, 0) - at(0, 1)) / s,
    ];
  }
  return quatNormalize(out);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export interface DieState {
  pos: Vec3;
  vel: Vec3;
  quat: Quat;
  angVel: Vec3;
  settled: boolean;
  restTime: number;
}

export interface TrayBounds {
  /** Half-width on X. */
  halfX: number;
  /** Half-depth on Z. */
  halfZ: number;
}

export const defaultTray: TrayBounds = { halfX: 3.4, halfZ: 2.4 };

const GRAVITY = -22;
const RESTITUTION = 0.42;
const FRICTION = 0.86;
const LINEAR_DAMPING = 0.55;
const ANGULAR_DAMPING = 0.9;
const SLEEP_LINEAR = 0.22;
const SLEEP_ANGULAR = 0.5;
const SLEEP_TIME = 0.22;

export function createDie(index: number, rng: () => number): DieState {
  return {
    pos: [-1.6 + index * 1.6 + (rng() - 0.5) * 0.3, 3.2 + rng() * 1.4, -0.8 + (rng() - 0.5) * 0.8],
    vel: [(rng() - 0.5) * 6, -2 - rng() * 3, 2 + rng() * 4],
    quat: quatNormalize([rng() - 0.5, rng() - 0.5, rng() - 0.5, rng() - 0.5]),
    angVel: [(rng() - 0.5) * 26, (rng() - 0.5) * 26, (rng() - 0.5) * 26],
    settled: false,
    restTime: 0,
  };
}

export function createDice(count: number, rng: () => number): DieState[] {
  return Array.from({ length: count }, (_, i) => createDie(i, rng));
}

/**
 * Advances the whole tray by `dt` seconds. Mutation-free: returns new states.
 * Uses a sphere-approximated cube so collisions stay stable at large steps.
 */
export function stepDice(dice: DieState[], dt: number, tray: TrayBounds = defaultTray): DieState[] {
  const next = dice.map((d) => step(d, dt, tray));
  // Pairwise separation so dice visibly collide instead of overlapping.
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i]!;
      const b = next[j]!;
      const dx = b.pos[0] - a.pos[0];
      const dy = b.pos[1] - a.pos[1];
      const dz = b.pos[2] - a.pos[2];
      const dist = Math.hypot(dx, dy, dz) || 1e-6;
      const min = DIE_SIZE * 1.05;
      if (dist < min) {
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        a.pos = [a.pos[0] - nx * push, a.pos[1] - ny * push, a.pos[2] - nz * push];
        b.pos = [b.pos[0] + nx * push, b.pos[1] + ny * push, b.pos[2] + nz * push];
        a.vel = [a.vel[0] - nx * 1.5, a.vel[1], a.vel[2] - nz * 1.5];
        b.vel = [b.vel[0] + nx * 1.5, b.vel[1], b.vel[2] + nz * 1.5];
        a.settled = false;
        b.settled = false;
        a.restTime = 0;
        b.restTime = 0;
      }
    }
  }
  return next;
}

function step(die: DieState, dt: number, tray: TrayBounds): DieState {
  if (die.settled) return die;
  let [px, py, pz] = die.pos;
  let [vx, vy, vz] = die.vel;
  let angVel = die.angVel;

  vy += GRAVITY * dt;
  px += vx * dt;
  py += vy * dt;
  pz += vz * dt;

  let touching = false;
  if (py < HALF) {
    py = HALF;
    if (vy < 0) vy = -vy * RESTITUTION;
    if (Math.abs(vy) < 0.6) vy = 0;
    vx *= FRICTION;
    vz *= FRICTION;
    angVel = [angVel[0] * 0.78, angVel[1] * 0.78, angVel[2] * 0.78];
    touching = true;
  }
  if (px < -tray.halfX + HALF) {
    px = -tray.halfX + HALF;
    vx = Math.abs(vx) * RESTITUTION;
  } else if (px > tray.halfX - HALF) {
    px = tray.halfX - HALF;
    vx = -Math.abs(vx) * RESTITUTION;
  }
  if (pz < -tray.halfZ + HALF) {
    pz = -tray.halfZ + HALF;
    vz = Math.abs(vz) * RESTITUTION;
  } else if (pz > tray.halfZ - HALF) {
    pz = tray.halfZ - HALF;
    vz = -Math.abs(vz) * RESTITUTION;
  }

  const damp = Math.exp(-LINEAR_DAMPING * dt);
  vx *= damp;
  vz *= damp;
  const adamp = Math.exp(-ANGULAR_DAMPING * dt);
  angVel = [angVel[0] * adamp, angVel[1] * adamp, angVel[2] * adamp];

  const quat = integrateRotation(die.quat, angVel, dt);
  const slow =
    touching && Math.hypot(vx, vy, vz) < SLEEP_LINEAR && Math.hypot(...angVel) < SLEEP_ANGULAR;
  const restTime = slow ? die.restTime + dt : 0;
  const settled = restTime >= SLEEP_TIME;

  return {
    pos: [px, py, pz],
    vel: settled ? [0, 0, 0] : [vx, vy, vz],
    quat: settled ? snapQuat(quat) : quat,
    angVel: settled ? [0, 0, 0] : angVel,
    settled,
    restTime,
  };
}

export function allSettled(dice: DieState[]): boolean {
  return dice.length > 0 && dice.every((d) => d.settled);
}

export function facesOf(dice: DieState[]): number[] {
  return dice.map((d) => topFaceValue(d.quat));
}

/**
 * Runs the simulation to rest. Used by the reduced-motion fallback and by
 * tests; the animated tray runs the exact same `stepDice` per frame.
 */
export function simulateToRest(
  count: number,
  rng: () => number,
  tray: TrayBounds = defaultTray,
  maxSteps = 3000,
): { dice: DieState[]; faces: number[]; steps: number } {
  let dice = createDice(count, rng);
  let steps = 0;
  while (steps < maxSteps && !allSettled(dice)) {
    dice = stepDice(dice, 1 / 90, tray);
    steps++;
  }
  if (!allSettled(dice)) {
    dice = dice.map((d) => ({
      ...d,
      pos: [d.pos[0], HALF, d.pos[2]] as Vec3,
      vel: [0, 0, 0] as Vec3,
      quat: snapQuat(d.quat),
      angVel: [0, 0, 0] as Vec3,
      settled: true,
    }));
  }
  return { dice, faces: facesOf(dice), steps };
}
