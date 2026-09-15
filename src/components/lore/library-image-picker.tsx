import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { assetUrl, isImageAsset, listAssets, type AssetRow } from "@/lib/assets";

function AssetTile({ row, onPick }: { row: AssetRow; onPick: (path: string) => void }) {
  const url = useQuery({
    queryKey: ["asset-url", row.storage_path],
    queryFn: () => assetUrl(row.storage_path),
    staleTime: 1000 * 60 * 30,
  });
  return (
    <button
      type="button"
      onClick={() => onPick(row.storage_path)}
      className="group focus-visible:ring-ring overflow-hidden rounded-lg border text-left focus-visible:ring-2 focus-visible:outline-none"
    >
      {url.data ? (
        <img
          src={url.data}
          alt={row.title}
          loading="lazy"
          className="h-32 w-full object-cover transition-transform group-hover:scale-105"
        />
      ) : (
        <Skeleton className="h-32 w-full rounded-none" />
      )}
      <span className="block truncate px-2 py-1.5 text-xs">{row.title}</span>
    </button>
  );
}

/** Picks an existing campaign library image instead of uploading a duplicate. */
export function LibraryImagePicker({
  campaignId,
  onPick,
  disabled,
}: {
  campaignId: string;
  onPick: (path: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const assets = useQuery({
    queryKey: ["assets", campaignId],
    queryFn: () => listAssets(campaignId),
    enabled: open,
  });
  const images = (assets.data ?? []).filter(isImageAsset);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <ImagePlus className="mr-2 size-4" /> Pick from library
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Campaign library</DialogTitle>
          <DialogDescription>Reuse an image already uploaded to this campaign.</DialogDescription>
        </DialogHeader>
        {assets.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[9.5rem] w-full rounded-lg" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No images in the campaign library yet.
          </p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-4">
            {images.map((row) => (
              <AssetTile
                key={row.id}
                row={row}
                onPick={(path) => {
                  onPick(path);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
