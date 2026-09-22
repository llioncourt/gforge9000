import type React from "react";

/**
 * Static ambient aurora field.
 *
 * These viewport-sized blurred layers must remain static. Moving them on every
 * pointer event forces expensive compositor work and can make the browser's
 * renderer unresponsive on some desktop GPUs.
 */
export function AmbientBackground() {
  return (
    <div className="ambient-field no-print" aria-hidden="true">
      <div
        className="ambient-blob"
        style={
          {
            "--depth": 1,
            top: "-8vh",
            left: "-6vw",
            width: "46vw",
            height: "46vw",
            background: "radial-gradient(circle at 30% 30%, var(--color-primary), transparent 70%)",
          } as React.CSSProperties
        }
      />
      <div
        className="ambient-blob"
        style={
          {
            "--depth": -1.6,
            top: "12vh",
            right: "-12vw",
            width: "52vw",
            height: "52vw",
            background: "radial-gradient(circle at 60% 40%, var(--color-accent), transparent 70%)",
            opacity: 0.38,
          } as React.CSSProperties
        }
      />
      <div
        className="ambient-blob"
        style={
          {
            "--depth": 0.7,
            bottom: "-18vh",
            left: "28vw",
            width: "48vw",
            height: "48vw",
            background: "radial-gradient(circle at 50% 50%, var(--color-chart-5), transparent 70%)",
            opacity: 0.25,
          } as React.CSSProperties
        }
      />
      <div className="ambient-grid" />
    </div>
  );
}
