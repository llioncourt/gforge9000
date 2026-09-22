/** Shared, browser-safe constants for the assistant connection. */

/** Public endpoint external assistants connect to. */
export const MCP_ENDPOINT_PATH = "/api/public/mcp";

/** RFC 9728 discovery path for the endpoint above. */
export const MCP_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_ENDPOINT_PATH}`;

export function mcpEndpointUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${MCP_ENDPOINT_PATH}`;
}
