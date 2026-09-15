// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Dev tooling annotates every JSX element with `data-tsd-source`. react-three-fiber
// rejects unknown dashed props on three.js objects ("Cannot set data-tsd-source"),
// so strip the annotation from the 3D scene files only.
const stripTsdSourceInR3F = {
  name: "lovable:strip-tsd-source-r3f",
  apply: "serve" as const,
  transform(code: string, id: string) {
    if (!/src\/components\/(character\/model-viewer|battle\/)[^?]*\.tsx/.test(id)) return null;
    if (!code.includes("data-tsd-source")) return null;
    return { code: code.replace(/\s*data-tsd-source=(?:"[^"]*"|\{[^}]*\})/g, ""), map: null };
  },
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [stripTsdSourceInR3F],
    // Pre-bundle the 3D stack at startup. Otherwise the first time the viewer is
    // opened Vite discovers these deps, re-optimizes, and the mid-session reload
    // can leave a stale React copy ("Cannot read properties of null (useContext)").
    optimizeDeps: {
      include: ["three", "@react-three/fiber", "@react-three/drei"],
    },
  },
});


