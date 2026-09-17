import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useT, useFormatters } from "@/i18n/hooks";

/** Scrub a video and capture the current frame as a JPEG blob. */
export function VideoFramePicker({
  src,
  crossOrigin,
  busy,
  actionLabel,
  onCapture,
}: {
  src: string;
  crossOrigin?: boolean;
  busy?: boolean;
  actionLabel?: string;
  onCapture: (blob: Blob) => void;
}) {
  const { t } = useT("media");
  const f = useFormatters();
  const label = actionLabel ?? t("framePicker.useThisFrame");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setDuration(0); setTime(0); setError(null); }, [src]);

  function seek(value: number) {
    setTime(value);
    const video = videoRef.current;
    if (video) video.currentTime = value;
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { setError(t("framePicker.videoStillLoading")); return; }
    const canvas = document.createElement("canvas");
    const width = Math.min(video.videoWidth, 960);
    canvas.width = width;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
    const ctx = canvas.getContext("2d");
    if (!ctx) { setError(t("framePicker.couldNotReadFrame")); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      canvas.toBlob((blob) => {
        if (!blob) { setError(t("framePicker.couldNotReadFrame")); return; }
        setError(null);
        onCapture(blob);
      }, "image/jpeg", 0.85);
    } catch {
      setError(t("framePicker.framesUnreadable"));
    }
  }

  return <div className="space-y-3">
    <video
      ref={videoRef}
      src={src}
      {...(crossOrigin ? { crossOrigin: "anonymous" as const } : {})}
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration || 0); event.currentTarget.currentTime = 0; }}
      onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      className="aspect-video w-full rounded-md border border-border bg-background object-contain"
    />
    <div className="flex items-center gap-3">
      <Slider value={[time]} min={0} max={Math.max(duration, 0.1)} step={0.05} onValueChange={(value) => seek(value[0] ?? 0)} className="flex-1" aria-label={t("framePicker.sliderAria")} />
      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{f.duration(time)} / {f.duration(duration)}</span>
    </div>
    {error ? <p className="text-xs text-destructive">{error}</p> : null}
    <Button type="button" onClick={capture} disabled={busy}>
      <ImageIcon className="mr-2 h-4 w-4" />{busy ? t("framePicker.saving") : label}
    </Button>
  </div>;
}
