import { createFileRoute } from "@tanstack/react-router";

/**
 * Public assistant connection endpoint.
 *
 * Callers authenticate with their own account through OAuth; requests without a
 * valid token get a 401 with the standard discovery challenge. The handler is
 * imported lazily so the server-only MCP layer never enters the client bundle.
 */
async function handle({ request }: { request: Request }): Promise<Response> {
  const { handleMcpRequest } = await import("@/lib/mcp/handler.server");
  return handleMcpRequest(request);
}

export const Route = createFileRoute("/api/public/mcp")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      DELETE: handle,
      OPTIONS: handle,
    },
  },
});
