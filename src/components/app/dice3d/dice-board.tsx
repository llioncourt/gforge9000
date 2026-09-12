import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  allSettled,
  createDice,
  defaultTray,
  DIE_SIZE,
  facesOf,
  stepDice,
  type DieState,
} from "@/lib/dice3d";
import { BOX_FACE_VALUES, disposePipTextures, pipTexture } from "./pips";

function DieMesh({ index, dice }: { index: number; dice: React.RefObject<DieState[]> }) {
  const ref = useRef<THREE.Mesh>(null);
  const materials = useMemo(
    () =>
      BOX_FACE_VALUES.map(
        (value) =>
          new THREE.MeshStandardMaterial({
            map: pipTexture(value),
            roughness: 0.42,
            metalness: 0.05,
          }),
      ),
    [],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  useFrame(() => {
    const state = dice.current?.[index];
    const mesh = ref.current;
    if (!state || !mesh) return;
    mesh.position.set(state.pos[0], state.pos[1], state.pos[2]);
    mesh.quaternion.set(state.quat[0], state.quat[1], state.quat[2], state.quat[3]);
  });

  return (
    <mesh ref={ref} castShadow receiveShadow material={materials}>
      <boxGeometry args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} />
    </mesh>
  );
}

function Simulation({
  count,
  seed,
  dice,
  onSettled,
}: {
  count: number;
  seed: number;
  dice: React.RefObject<DieState[]>;
  onSettled: (faces: number[]) => void;
}) {
  const reported = useRef(false);
  const elapsed = useRef(0);

  useEffect(() => {
    let s = (seed >>> 0) || 1;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    dice.current = createDice(count, rng);
    reported.current = false;
    elapsed.current = 0;
  }, [count, seed, dice]);

  useFrame((_, rawDelta) => {
    if (!dice.current || reported.current) return;
    const dt = Math.min(rawDelta, 0.1);
    elapsed.current += rawDelta;
    // Fixed sub-steps keep the simulation stable at any frame rate.
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      dice.current = stepDice(dice.current, step, defaultTray);
      remaining -= step;
    }
    // Safety net for very slow devices: finish the same simulation headlessly
    // so the result never stalls. The dice snap to the faces that result.
    if (!allSettled(dice.current) && elapsed.current > 6) {
      let guard = 0;
      while (!allSettled(dice.current) && guard < 2000) {
        dice.current = stepDice(dice.current, 1 / 120, defaultTray);
        guard++;
      }
    }
    if (allSettled(dice.current)) {
      reported.current = true;
      onSettled(facesOf(dice.current));
    }
  });


  return null;
}

function Tray() {
  const wall = (props: { position: [number, number, number]; args: [number, number, number] }) => (
    <mesh position={props.position} receiveShadow>
      <boxGeometry args={props.args} />
      <meshStandardMaterial color="#2b2f38" roughness={0.9} transparent opacity={0.55} />
    </mesh>
  );
  const { halfX, halfZ } = defaultTray;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[halfX * 2, halfZ * 2]} />
        <meshStandardMaterial color="#20252d" roughness={0.95} />
      </mesh>
      <gridHelper args={[halfX * 2, 10, "#3a4150", "#2a2f38"]} position={[0, 0.01, 0]} />
      {wall({ position: [-halfX, 0.5, 0], args: [0.12, 1, halfZ * 2] })}
      {wall({ position: [halfX, 0.5, 0], args: [0.12, 1, halfZ * 2] })}
      {wall({ position: [0, 0.5, -halfZ], args: [halfX * 2, 1, 0.12] })}
      {wall({ position: [0, 0.5, halfZ], args: [halfX * 2, 1, 0.12] })}
    </group>
  );
}

export default function DiceBoard({
  count,
  seed,
  onSettled,
}: {
  count: number;
  seed: number;
  onSettled: (faces: number[]) => void;
}) {
  const dice = useRef<DieState[]>([]);
  useEffect(() => () => disposePipTextures(), []);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 6.4, 6.6], fov: 42 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.3, 0)}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#161a20"]} />
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[4, 9, 5]}
        intensity={2.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-5, 4, -4]} intensity={0.5} color="#8fb3d9" />
      <Tray />
      {Array.from({ length: count }, (_, i) => (
        <DieMesh key={i} index={i} dice={dice} />
      ))}
      <Simulation count={count} seed={seed} dice={dice} onSettled={onSettled} />
    </Canvas>
  );
}
