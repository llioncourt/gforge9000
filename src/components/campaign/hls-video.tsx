import { useEffect, useRef, useState, type MutableRefObject, type VideoHTMLAttributes } from "react";
import { resolveHlsPlaylistUrl } from "@/lib/video-hls";

type HlsVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  /** Master playlist storage path; when absent the component plays `src` directly. */
  hlsPath?: string | null;
  /** Progressive MP4 fallback URL. */
  src?: string;
  videoRef?: MutableRefObject<HTMLVideoElement | null>;
};

/**
 * Plays a campaign video over HLS when a packaged bundle exists, otherwise falls
 * back to the progressive MP4 source.
 */
export function HlsVideo({ hlsPath, src, videoRef, ...props }: HlsVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [fallbackOnly, setFallbackOnly] = useState(false);

  useEffect(() => {
    if (!hlsPath || fallbackOnly) return;
    let live = true;
    let revoke: (() => void) | null = null;
    let destroy: (() => void) | null = null;

    void (async () => {
      try {
        const [{ default: Hls }, playlist] = await Promise.all([import("hls.js"), resolveHlsPlaylistUrl(hlsPath)]);
        if (!live) {
          playlist.revoke();
          return;
        }
        revoke = playlist.revoke;
        const video = ref.current;
        if (!video) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              hls.destroy();
              if (live) setFallbackOnly(true);
            }
          });
          hls.loadSource(playlist.url);
          hls.attachMedia(video);
          destroy = () => hls.destroy();
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = playlist.url;
        } else {
          setFallbackOnly(true);
        }
      } catch {
        if (live) setFallbackOnly(true);
      }
    })();

    return () => {
      live = false;
      destroy?.();
      revoke?.();
    };
  }, [hlsPath, fallbackOnly]);

  const useHls = Boolean(hlsPath) && !fallbackOnly;
  return <video ref={(node) => { ref.current = node; if (videoRef) videoRef.current = node; }} {...props} src={useHls ? undefined : src} />;
}
