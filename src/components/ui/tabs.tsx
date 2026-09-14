import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "no-scrollbar glass-soft flex h-auto max-w-full items-center justify-start gap-1 overflow-x-auto rounded-lg p-1 text-muted-foreground sm:h-9",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

/**
 * TabsList that never wraps to a second line. When the available width is
 * smaller than the content, left/right scroll arrows appear so the user can
 * reach every tab horizontally.
 */
const ScrollableTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);

  const update = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Observe size changes of the tab triggers themselves.
    Array.from(el.children).forEach((c) => ro.observe(c));
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);

  // Smooth eased scroll so arrow taps glide rather than snap.
  const tweenRef = React.useRef<number | null>(null);
  function animateScroll(target: number) {
    const el = listRef.current;
    if (!el) return;
    if (tweenRef.current) cancelAnimationFrame(tweenRef.current);
    const start = el.scrollLeft;
    const distance = target - start;
    const duration = 380;
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      el.scrollLeft = start + distance * ease(t);
      if (t < 1) {
        tweenRef.current = requestAnimationFrame(step);
      } else {
        tweenRef.current = null;
      }
    };
    tweenRef.current = requestAnimationFrame(step);
  }

  function scrollBy(dir: number) {
    const el = listRef.current;
    if (!el) return;
    animateScroll(el.scrollLeft + dir * Math.max(el.clientWidth * 0.7, 200));
  }

  React.useImperativeHandle(ref, () => listRef.current as never);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Scroll tabs left"
        tabIndex={-1}
        onClick={() => scrollBy(-1)}
        className={cn(
          "grid h-8 w-8 shrink-0 place-content-center rounded-md text-muted-foreground transition-opacity hover:bg-secondary hover:text-foreground",
          canLeft ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <TabsList ref={listRef} className={cn("flex-1", className)} {...props}>
        {children}
      </TabsList>
      <button
        type="button"
        aria-label="Scroll tabs right"
        tabIndex={-1}
        onClick={() => scrollBy(1)}
        className={cn(
          "grid h-8 w-8 shrink-0 place-content-center rounded-md text-muted-foreground transition-opacity hover:bg-secondary hover:text-foreground",
          canRight ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
});
ScrollableTabsList.displayName = "ScrollableTabsList";

export { Tabs, TabsList, TabsTrigger, TabsContent, ScrollableTabsList };
