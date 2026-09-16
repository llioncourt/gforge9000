import { useEffect } from "react";

const BYPASS_ATTRIBUTE = "data-card-transition-bypass";

function isPlainPrimaryClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function CardPageTransition() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isPlainPrimaryClick(event) || event.defaultPrevented) return;
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest<HTMLAnchorElement>("a.interactive-card[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      if (link.getAttribute(BYPASS_ATTRIBUTE) === "true") {
        link.removeAttribute(BYPASS_ATTRIBUTE);
        return;
      }

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.href === window.location.href) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const rect = link.getBoundingClientRect();
      const clone = link.cloneNode(true) as HTMLElement;
      clone.removeAttribute("href");
      clone.setAttribute("aria-hidden", "true");
      clone.classList.add("page-card-transition-clone");
      Object.assign(clone.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });

      document.body.appendChild(clone);
      link.classList.add("page-card-transition-source");
      document.documentElement.classList.add("page-card-transition-active");

      requestAnimationFrame(() => clone.classList.add("is-launching"));

      window.setTimeout(() => {
        link.setAttribute(BYPASS_ATTRIBUTE, "true");
        link.click();
        document.documentElement.classList.remove("page-card-transition-active");
        clone.remove();
        link.classList.remove("page-card-transition-source");
      }, 280);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}