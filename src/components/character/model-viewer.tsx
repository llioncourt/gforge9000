import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Loads a .glb from a signed URL and frames it in a small turntable canvas. */
export default function ModelViewer({ url }: { url: string }) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
        root.scale.setScalar(2 / maxAxis);
        root.position.sub(center.multiplyScalar(2 / maxAxis));
        setScene(root);
      },
      undefined,
      () => !cancelled && setError("Could not read that model."),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <Canvas camera={{ position: [0, 1.2, 3.4], fov: 45 }} dpr={[1, 2]}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} />
      <Suspense fallback={null}>{scene ? <primitive object={scene} /> : null}</Suspense>
    </Canvas>
  );
}
