import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls, Grid, Environment } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DEFAULT_MODEL_TRANSFORM, type ModelTransform } from "@/lib/model3d";

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

const BACKDROP_COLOR: Record<BackdropMode, string | null> = {
  graphite: "#15171c",
  ink: "#05070a",
  paper: "#e9e6df",
  void: null,
};

type Loaded = {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  originals: Map<string, THREE.Material | THREE.Material[]>;
  info: ModelInfo;
};

function useGlb(url: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setError(null);
    setProgress(0);
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
        root.position.sub(center.multiplyScalar(scale));

        const originals = new Map<string, THREE.Material | THREE.Material[]>();
        let meshes = 0;
        let triangles = 0;
        let vertices = 0;
        const materialIds = new Set<string>();
        root.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          meshes += 1;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          originals.set(mesh.uuid, mesh.material);
          const geom = mesh.geometry as THREE.BufferGeometry;
          const pos = geom.getAttribute("position");
          if (pos) vertices += pos.count;
          const index = geom.getIndex();
          triangles += index ? index.count / 3 : pos ? pos.count / 3 : 0;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (m) materialIds.add(m.uuid);
          }
        });

        setLoaded({
          scene: root,
          clips: gltf.animations ?? [],
          originals,
          info: {
            meshes,
            triangles: Math.round(triangles),
            vertices,
            materials: materialIds.size,
            animations: (gltf.animations ?? []).map((c, i) => c.name || `Clip ${i + 1}`),
            size: { x: size.x, y: size.y, z: size.z },
          },
        });
      },
      (ev) => {
        if (cancelled || !ev.total) return;
        setProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      },
      () => !cancelled && setError("Could not read that model."),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { loaded, error, progress };
}

/** Applies the saved orientation and keeps the model standing on the floor. */
function Oriented({
  loaded,
  transform,
  boundingBox,
  clipName,
  playing,
  speed,
}: {
  loaded: Loaded;
  transform: ModelTransform;
  boundingBox: boolean;
  clipName: string | null;
  playing: boolean;
  speed: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const { rx, ry, rz, scale } = transform;
  const [box, setBox] = useState<THREE.Box3 | null>(null);

  const mixer = useMemo(
    () => (loaded.clips.length ? new THREE.AnimationMixer(loaded.scene) : null),
    [loaded],
  );

  useEffect(() => {
    if (!mixer) return;
    mixer.stopAllAction();
    if (!clipName) return;
    const clip =
      loaded.clips.find((c, i) => (c.name || `Clip ${i + 1}`) === clipName) ?? loaded.clips[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.reset().play();
    return () => {
      action.stop();
    };
  }, [mixer, loaded, clipName]);

  useFrame((_, delta) => {
    if (mixer && playing) mixer.update(delta * speed);
  });

  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const d = Math.PI / 180;
    g.rotation.set(rx * d, ry * d, rz * d);
    g.scale.setScalar(scale || 1);
    g.position.y = 0;
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g);
    if (Number.isFinite(b.min.y)) g.position.y = -b.min.y;
    g.updateMatrixWorld(true);
    setBox(new THREE.Box3().setFromObject(g));
  }, [loaded, rx, ry, rz, scale]);

  return (
    <>
      <group ref={ref}>
        <primitive object={loaded.scene} />
      </group>
      {boundingBox && box ? <box3Helper args={[box, new THREE.Color("#d7a13b")]} /> : null}
    </>
  );
}

/** Swaps materials for the selected shading mode and applies wireframe. */
function useMaterialMode(loaded: Loaded | null, mode: MaterialMode, wireframe: boolean) {
  useEffect(() => {
    if (!loaded) return;
    const replacement =
      mode === "normal"
        ? new THREE.MeshNormalMaterial()
        : mode === "clay"
          ? new THREE.MeshStandardMaterial({ color: "#cfc7bb", roughness: 0.85, metalness: 0 })
          : mode === "xray"
            ? new THREE.MeshBasicMaterial({
                color: "#7dd3fc",
                transparent: true,
                opacity: 0.28,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
              })
            : null;

    loaded.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const original = loaded.originals.get(mesh.uuid);
      mesh.material = replacement ?? original ?? mesh.material;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mat = m as THREE.MeshStandardMaterial;
        if (mat && "wireframe" in mat) mat.wireframe = wireframe;
      }
    });

    return () => {
      replacement?.dispose();
    };
  }, [loaded, mode, wireframe]);
}

function Lighting({ preset, intensity }: { preset: LightingPreset; intensity: number }) {
  if (preset === "flat") {
    return (
      <>
        <ambientLight intensity={1.15 * intensity} />
        <hemisphereLight args={["#ffffff", "#b9bec7", 0.7 * intensity]} />
      </>
    );
  }
  if (preset === "dramatic") {
    return (
      <>
        <ambientLight intensity={0.12 * intensity} />
        <spotLight
          position={[4, 7, 3]}
          angle={0.5}
          penumbra={0.7}
          intensity={12 * intensity}
          castShadow
        />
        <pointLight position={[-4, 2, -3]} intensity={3 * intensity} color="#4a7bd0" />
      </>
    );
  }
  if (preset === "noir") {
    return (
      <>
        <ambientLight intensity={0.06 * intensity} />
        <directionalLight position={[-5, 6, 2]} intensity={2.4 * intensity} castShadow />
        <pointLight position={[3, 1, -4]} intensity={1.6 * intensity} color="#ffffff" />
      </>
    );
  }
  if (preset === "sunset") {
    return (
      <>
        <hemisphereLight args={["#ffb27a", "#2a1c2b", 0.8 * intensity]} />
        <directionalLight
          position={[5, 3, 2]}
          intensity={2.2 * intensity}
          color="#ff9a52"
          castShadow
        />
        <directionalLight position={[-4, 2, -4]} intensity={0.8 * intensity} color="#6f7ae0" />
      </>
    );
  }
  return (
    <>
      <hemisphereLight args={["#dfe6f2", "#20242c", 1.0 * intensity]} />
      <ambientLight intensity={0.35 * intensity} />
      <directionalLight position={[4, 6, 3]} intensity={1.4 * intensity} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5 * intensity} />
    </>
  );
}

function Rig({
  api,
  exposure,
  fov,
  stage,
}: {
  api?: ((a: ViewerApi) => void) | undefined;
  exposure: number;
  fov: number;
  stage: boolean;
}) {
  const { camera, gl, scene, controls } = useThree();

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.isPerspectiveCamera) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }, [camera, fov]);

  useEffect(() => {
    if (!api) return;
    const dist = stage ? 4.2 : 3.4;
    const positions: Record<CameraView, [number, number, number]> = {
      front: [0, 1.2, dist],
      back: [0, 1.2, -dist],
      left: [-dist, 1.2, 0],
      right: [dist, 1.2, 0],
      top: [0, dist + 1.2, 0.001],
      iso: [dist * 0.7, dist * 0.7, dist * 0.7],
    };
    api({
      setView: (view) => {
        const p = positions[view];
        camera.position.set(p[0], p[1], p[2]);
        camera.lookAt(0, 1, 0);
        const c = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
        c?.target?.set(0, 1, 0);
        c?.update?.();
      },
      screenshot: () => {
        gl.render(scene, camera);
        try {
          return gl.domElement.toDataURL("image/png");
        } catch {
          return null;
        }
      },
    });
  }, [api, camera, gl, scene, controls, stage]);

  return null;
}

/**
 * Loads a .glb from a signed URL.
 * `stage` adds orbit/zoom controls, ground shadow and grid for the large viewer.
 */
export default function ModelViewer({
  url,
  stage = false,
  transform = DEFAULT_MODEL_TRANSFORM,
  settings = DEFAULT_VIEWER_SETTINGS,
  onInfo,
  onApi,
}: {
  url: string;
  stage?: boolean;
  transform?: ModelTransform;
  settings?: ViewerSettings;
  onInfo?: ((info: ModelInfo) => void) | undefined;
  onApi?: ((api: ViewerApi) => void) | undefined;
}) {
  const { loaded, error, progress } = useGlb(url);
  useMaterialMode(loaded, settings.materialMode, settings.wireframe);

  useEffect(() => {
    if (loaded && onInfo) onInfo(loaded.info);
  }, [loaded, onInfo]);

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        {error}
      </div>
    );
  }

  const bg = BACKDROP_COLOR[settings.backdrop];

  return (
    <Canvas
      shadows
      camera={{ position: [0, 1.6, stage ? 4.2 : 3.4], fov: settings.fov }}
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
    >
      {bg ? <color attach="background" args={[bg]} /> : null}
      <Rig onApiHolder={undefined} api={onApi} exposure={settings.exposure} fov={settings.fov} stage={stage} />
      <Lighting preset={settings.lighting} intensity={settings.lightIntensity} />
      {settings.lighting === "studio" && stage ? (
        <Environment resolution={64}>
          <mesh scale={12}>
            <sphereGeometry args={[1, 24, 24]} />
            <meshBasicMaterial color="#5c6370" side={THREE.BackSide} />
          </mesh>
        </Environment>
      ) : null}
      <Suspense fallback={null}>
        {loaded ? (
          <Oriented
            loaded={loaded}
            transform={transform}
            boundingBox={stage && settings.boundingBox}
            clipName={settings.animation}
            playing={settings.animationPlaying}
            speed={settings.animationSpeed}
          />
        ) : null}
      </Suspense>
      {stage && settings.axes ? <axesHelper args={[2.5]} /> : null}
      {stage ? (
        <>
          {settings.shadows ? (
            <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={12} blur={2.6} far={6} />
          ) : null}
          {settings.grid ? (
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
          ) : null}
          <OrbitControls
            makeDefault
            enablePan
            autoRotate={settings.autoRotate}
            autoRotateSpeed={settings.autoRotateSpeed}
            minDistance={1.2}
            maxDistance={12}
            target={[0, 1, 0]}
          />
        </>
      ) : (
        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          autoRotate={settings.autoRotate}
          autoRotateSpeed={1.6}
          target={[0, 1, 0]}
        />
      )}
      {progress > 0 && !loaded ? null : null}
    </Canvas>
  );
}
