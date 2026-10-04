import type React from "react";
import { useEffect, useRef } from "react";

/**
 * Ambient aurora field with pointer + scroll parallax.
 *
 * Purely decorative: rendered behind the app (z-index -1, pointer-events none),
 * updated through CSS custom properties inside a single rAF frame so it never
 * triggers React re-renders. Disabled entirely for reduced-motion users and on
 * coarse pointers (phones/tablets) where the extra compositing is not worth it.
 *
 * Each glow is a plain gradient that already has the soft falloff painted in.
 * It used to be a hard-edged disc softened by a 90px blur filter, which the
 * browser had to recompute for three near-screen-sized layers every time the
 * pointer moved. The falloff below reproduces that blurred shape (same centre,
 * same reach, same intensity curve), so the look is kept and the layers are
 * now ordinary textures that only translate.
 */

/** Soft glow: `alphas` is the intensity from the centre (first) to the rim (last). */
function glow(color: string, alphas: readonly number[]): string {
  const last = alphas.length - 1;
  const stops = alphas.map(
    (alpha, index) =>
      `color-mix(in oklab, ${color} ${(alpha * 100).toFixed(1)}%, transparent) ${((index / last) * 100).toFixed(1)}%`,
  );
  return `radial-gradient(circle closest-side, ${stops.join(", ")})`;
}

const GLOW_PRIMARY = glow(
  "var(--color-primary)",
  [0.71, 0.681, 0.595, 0.454, 0.283, 0.136, 0.047, 0.011, 0],
);
const GLOW_ACCENT = glow(
  "var(--color-accent)",
  [0.761, 0.723, 0.625, 0.487, 0.326, 0.171, 0.063, 0.015, 0],
);
const GLOW_VIOLET = glow(
  "var(--color-chart-5)",
  [0.703, 0.665, 0.563, 0.426, 0.28, 0.153, 0.064, 0.019, 0],
);

export function AmbientBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    let frame = 0;
    let px = 0;
    let py = 0;

    const apply = () => {
      frame = 0;
      el.style.setProperty("--px", px.toFixed(2));
      el.style.setProperty("--py", py.toFixed(2));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const onPointer = (event: PointerEvent) => {
      px = (event.clientX / window.innerWidth - 0.5) * 40;
      py = (event.clientY / window.innerHeight - 0.5) * 40 + window.scrollY * 0.04;
      schedule();
    };
    const onScroll = () => {
      py = window.scrollY * 0.04;
      schedule();
    };

    if (fine) window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div ref={ref} className="ambient-field no-print" aria-hidden="true">
      <div
        className="ambient-blob"
        style={
          {
            "--depth": 1,
            top: "calc(-8vh - 17.25vw)",
            left: "-23.25vw",
            width: "71.2vw",
            height: "71.2vw",
            background: GLOW_PRIMARY,
          } as React.CSSProperties
        }
      />
      <div
        className="ambient-blob"
        style={
          {
            "--depth": -1.6,
            top: "calc(12vh - 15.23vw)",
            right: "-27.23vw",
            width: "75.6vw",
            height: "75.6vw",
            background: GLOW_ACCENT,
            opacity: 0.38,
          } as React.CSSProperties
        }
      />
      <div
        className="ambient-blob"
        style={
          {
            "--depth": 0.7,
            bottom: "calc(-18vh - 8.9vw)",
            left: "19.1vw",
            width: "65.8vw",
            height: "65.8vw",
            background: GLOW_VIOLET,
            opacity: 0.25,
          } as React.CSSProperties
        }
      />
      <div className="ambient-grid" />
    </div>
  );
}
