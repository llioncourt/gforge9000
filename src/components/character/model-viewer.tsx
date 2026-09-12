import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function useGlb(url: string) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setScene(null);
    setError(null);
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxAxis = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2 / maxAxis;
        root.scale.setScalar(scale);
        // Centre on the origin; the orientation group below sits it on the floor.
        root.position.sub(center.multiplyScalar(scale));
        setScene(root);
      },
      undefined,
      () => !cancelled && setError("Could not read that model."),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { scene, error };
}

export type ModelTransform = { rx: number; ry: number; rz: number; scale: number };

export const DEFAULT_MODEL_TRANSFORM: ModelTransform = { rx: 0, ry: 0, rz: 0, scale: 1 };

/** Applies the saved orientation and keeps the model standing on the floor. */
function Oriented({ scene, transform }: { scene: THREE.Group; transform: ModelTransform }) {
  const ref = useRef<THREE.Group>(null);
  const { rx, ry, rz, scale } = transform;

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const d = Math.PI / 180;
    g.rotation.set(rx * d, ry * d, rz * d);
    g.scale.setScalar(scale || 1);
    g.position.y = 0;
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    if (Number.isFinite(box.min.y)) g.position.y = -box.min.y;
  }, [scene, rx, ry, rz, scale]);

  return (
    <group ref={ref}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * Loads a .glb from a signed URL.
 * `stage` adds orbit/zoom controls, ground shadow and grid for the large viewer.
 */
export default function ModelViewer({
  url,
  stage = false,
  autoRotate = true,
  wireframe = false,
  transform = DEFAULT_MODEL_TRANSFORM,
}: {
  url: string;
  stage?: boolean;
  autoRotate?: boolean;
  wireframe?: boolean;
  transform?: ModelTransform;
}) {
  const { scene, error } = useGlb(url);

  useMemo(() => {
    if (!scene) return;
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const mat = m as THREE.MeshStandardMaterial;
        if ("wireframe" in mat) mat.wireframe = wireframe;
      }
    });
  }, [scene, wireframe]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.6, stage ? 4.2 : 3.4], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
    >
      <hemisphereLight args={["#dfe6f2", "#20242c", 1.0]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />
      <Suspense fallback={null}>
        {scene ? <Oriented scene={scene} transform={transform} /> : null}
      </Suspense>
      {stage ? (
        <>
          <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={12} blur={2.6} far={6} />
          <Grid
            position={[0, 0, 0]}
            args={[20, 20]}
            cellSize={0.5}
            sectionSize={2}
            cellThickness={0.5}
            sectionThickness={1}
            infiniteGrid
            fadeDistance={18}
            fadeStrength={2}
            cellColor="#6b7280"
            sectionColor="#9ca3af"
          />
          <OrbitControls
            makeDefault
            enablePan
            autoRotate={autoRotate}
            autoRotateSpeed={1.2}
            minDistance={1.2}
            maxDistance={12}
            target={[0, 1, 0]}
          />
        </>
      ) : (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate={autoRotate}
          autoRotateSpeed={1.6}
          target={[0, 1, 0]}
        />
      )}
    </Canvas>
  );
}
