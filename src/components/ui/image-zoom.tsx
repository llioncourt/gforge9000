import { useState } from "react";
import { ZoomIn } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/hooks";

/**
 * Renders an image that opens a fullscreen zoom dialog on click.
 * Safe inside links/cards: the trigger stops propagation and prevents default.
 */
export function ImageZoom({
  src,
  alt,
  className,
  imgClassName,
  onError,
}: {
  src: string;
  alt: string;
  /** Classes for the trigger wrapper (sizing, rounding, border). */
  className?: string | undefined;
  /** Extra classes for the trigger image itself. */
  imgClassName?: string | undefined;
  onError?: (() => void) | undefined;
}) {
  const { t } = useT("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={t("a11y.zoomImage", { name: alt })}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "group focus-visible:ring-ring relative block cursor-zoom-in overflow-hidden focus-visible:ring-2 focus-visible:outline-none",
          className,
        )}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={onError}
          className={cn("h-full w-full object-cover", imgClassName)}
        />
        <span className="bg-foreground/0 pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:bg-foreground/25 group-hover:opacity-100">
          <ZoomIn className="text-background size-5 drop-shadow" />
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-auto max-w-[92vw] border-none bg-transparent p-0 shadow-none sm:max-w-[92vw]"
          aria-describedby={undefined}
          onClick={(event) => {
            // Dialog portals still bubble React events through the component tree.
            // Without this, clicking the close button reaches a wrapping card link.
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onInteractOutside={(event) => {
            // Keep the overlay mounted so the closing click does not fall
            // through to a parent link/card underneath (Radix ghost-click).
            // Users close via Escape or the × button.
            event.preventDefault();
          }}
        >
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img
            src={src}
            alt={alt}
            className="mx-auto max-h-[85vh] w-auto max-w-full rounded-lg border object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
