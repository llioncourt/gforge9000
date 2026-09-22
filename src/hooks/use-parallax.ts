import { useEffect, useRef } from "react";

/**
 * Writes the window scroll offset into a `--scroll` CSS variable on the returned
 * element, so children using `.parallax-layer` translate at their own `--speed`.
 *
 * Updates happen inside one rAF frame and never re-render React. No-ops for
 * users who prefer reduced motion.
 */
export function useParallax<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      el.style.setProperty("--scroll", String(Math.round(window.scrollY)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return ref;
}
