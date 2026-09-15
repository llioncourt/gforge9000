import { useEffect, useState } from "react";
import { assetUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageZoom } from "@/components/ui/image-zoom";

/** Renders a private library image by resolving a short-lived signed URL. */
export function AssetImage({
  path,
  alt,
  className,
}: {
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    assetUrl(path)
      .then((resolved) => {
        if (!active) return;
        if (resolved) setUrl(resolved);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [path]);

  if (failed) {
    return (
      <div
        className={cn(
          "text-muted-foreground bg-muted flex items-center justify-center text-xs",
          className,
        )}
      >
        Preview unavailable
      </div>
    );
  }
  if (!url) return <Skeleton className={className} />;
  return <ImageZoom src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
