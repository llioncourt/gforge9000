import { createFileRoute } from "@tanstack/react-router";
import { APP_BUILD_ID } from "@/lib/app-version";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "Content-Type": "application/json; charset=utf-8",
};

export const Route = createFileRoute("/api/public/version")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ buildId: APP_BUILD_ID }), {
          status: 200,
          headers: NO_CACHE_HEADERS,
        }),
      HEAD: async () => new Response(null, { status: 204, headers: NO_CACHE_HEADERS }),
    },
  },
});
