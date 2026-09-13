import { useRef, useState, type ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  function measureClamp() {
    const el = descRef.current;
    if (!el) return;
    // A clamped element's scrollHeight exceeds clientHeight when text is cut.
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
            <p
              ref={(el) => {
                descRef.current = el;
                if (el) {
                  // Measure after paint so clamped detection is reliable.
                  requestAnimationFrame(measureClamp);
                }
              }}
              className={expanded ? "" : "line-clamp-2"}
            >
              {description}
            </p>
            {clamped ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-0.5 font-medium text-foreground/70 hover:text-foreground"
              >
                {expanded ? "less…" : "more…"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
