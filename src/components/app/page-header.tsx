import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n/hooks";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  const { t } = useT("common");
  const [expanded, setExpanded] = useState(false);
  const [canClamp, setCanClamp] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (expanded) return;
    const el = descRef.current;
    if (!el) return;
    const measure = () => setCanClamp(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded, description]);

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <div className="mt-1 max-w-2xl text-sm text-muted-foreground">
            <p ref={descRef} className={expanded ? "" : "line-clamp-2"}>
              {description}
            </p>

            {canClamp || expanded ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-0.5 font-medium text-foreground/70 hover:text-foreground"
              >
                {expanded ? t("pageHeader.less") : t("pageHeader.more")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
