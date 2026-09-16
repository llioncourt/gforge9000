import { useEffect } from "react";

const CARD_SELECTOR = ".interactive-card, a.panel, [data-card-transition]";

export function CardTransitions() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    let cleanupTimer: number | null = null;

    const clearActive = () => {
      if (active) active.style.viewTransitionName = "";
      active = null;
      if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
      cleanupTimer = null;
    };

    const markCard = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest("a[href]");
      if (!link) return;

      const explicit = target?.closest<HTMLElement>(CARD_SELECTOR);
      const containingPanel = link.closest<HTMLElement>(".panel");
      const card = explicit ?? containingPanel ?? (link as HTMLElement);

      clearActive();
      active = card;
      active.style.viewTransitionName = "clicked-card";
      cleanupTimer = window.setTimeout(clearActive, 1_500);
    };

    document.addEventListener("pointerdown", markCard, true);
    return () => {
      document.removeEventListener("pointerdown", markCard, true);
      clearActive();
    };
  }, []);

  return null;
}