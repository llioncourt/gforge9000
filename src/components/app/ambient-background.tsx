import type React from "react";
import { useEffect, useRef } from "react";

/**
 * Ambient aurora field with pointer + scroll parallax.
 *
 * Purely decorative: rendered behind the app (z-index -1, pointer-events none),
 * updated through CSS custom properties inside a single rAF frame so it never
 * triggers React re-renders. Disabled entirely for reduced-motion users and on
 * coarse pointers (phones/tablets) where the extra compositing is not worth it.
 */
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
        style={{
          "--depth": 1,
          top: "-8vh",
          left: "-6vw",
          width: "46vw",
          height: "46vw",
          background:
            "radial-gradient(circle at 30% 30%, var(--color-primary), transparent 70%)",
        } as React.CSSProperties}
      />
      <div
        className="ambient-blob"
        style={{
          "--depth": -1.6,
          top: "12vh",
          right: "-12vw",
          width: "52vw",
          height: "52vw",
          background: "radial-gradient(circle at 60% 40%, var(--color-accent), transparent 70%)",
          opacity: 0.38,
        } as React.CSSProperties}
      />
      <div
        className="ambient-blob"
        style={{
          "--depth": 0.7,
          bottom: "-18vh",
          left: "28vw",
          width: "48vw",
          height: "48vw",
          background: "radial-gradient(circle at 50% 50%, var(--color-chart-5), transparent 70%)",
          opacity: 0.25,
        } as React.CSSProperties}
      />
      <div className="ambient-grid" />
    </div>
  );
}
