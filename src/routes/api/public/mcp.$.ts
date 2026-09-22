import { createFileRoute } from "@tanstack/react-router";

/**
 * Sub-paths of the assistant endpoint, most importantly the discovery document
 * the 401 challenge points at (`/api/public/mcp/oauth-protected-resource`).
 */
async function handle({ request }: { request: Request }): Promise<Response> {
  const { handleMcpRequest } = await import("@/lib/mcp/handler.server");
  return handleMcpRequest(request);
}

export const Route = createFileRoute("/api/public/mcp/$")({
  staticData: { sitemap: false },
  server: { handlers: { GET: handle, OPTIONS: handle } },
});
