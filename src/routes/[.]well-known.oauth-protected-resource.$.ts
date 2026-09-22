import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }): Promise<Response> {
  const { mcpResourceMetadataResponse } = await import("@/lib/mcp/resource-metadata.server");
  return mcpResourceMetadataResponse(request);
}

export const Route = createFileRoute("/.well-known/oauth-protected-resource/$")({
  staticData: { sitemap: false },
  server: { handlers: { GET: handle, OPTIONS: handle } },
});
