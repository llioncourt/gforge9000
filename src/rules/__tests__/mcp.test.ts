import { describe, expect, it } from "vitest";
import {
  MCP_PENDING_AUTHORIZATION_KEY,
  MCP_PENDING_AUTHORIZATION_TTL_MS,
  clearPendingAuthorization,
  consumePendingAuthorization,
  isValidAuthorizationId,
  rememberPendingAuthorization,
  type PendingAuthorizationStorage,
} from "@/lib/mcp/pending-authorization";
import { MCP_ENDPOINT_PATH, MCP_RESOURCE_METADATA_PATH, mcpEndpointUrl } from "@/lib/mcp/config";

function memoryStorage(): PendingAuthorizationStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe("authorization id validation", () => {
  it("accepts bounded url-safe ids", () => {
    expect(isValidAuthorizationId("abc-123_XYZ.~")).toBe(true);
  });

  it("rejects empty, oversized and unsafe values", () => {
    expect(isValidAuthorizationId("")).toBe(false);
    expect(isValidAuthorizationId("a".repeat(201))).toBe(false);
    expect(isValidAuthorizationId("https://evil.example/callback")).toBe(false);
    expect(isValidAuthorizationId("abc 123")).toBe(false);
    expect(isValidAuthorizationId(42)).toBe(false);
    expect(isValidAuthorizationId(null)).toBe(false);
  });
});

describe("pending authorization handoff", () => {
  it("stores only the id and the timestamp", () => {
    const storage = memoryStorage();
    expect(rememberPendingAuthorization("auth-1", storage, 1000)).toBe(true);
    expect(JSON.parse(storage.map.get(MCP_PENDING_AUTHORIZATION_KEY)!)).toEqual({
      authorizationId: "auth-1",
      savedAt: 1000,
    });
  });

  it("refuses to store an invalid id", () => {
    const storage = memoryStorage();
    expect(rememberPendingAuthorization("https://evil.example", storage, 1000)).toBe(false);
    expect(storage.map.size).toBe(0);
  });

  it("is consumed exactly once", () => {
    const storage = memoryStorage();
    rememberPendingAuthorization("auth-2", storage, 1000);
    expect(consumePendingAuthorization(storage, 2000)).toBe("auth-2");
    expect(consumePendingAuthorization(storage, 2000)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it("expires after the ttl", () => {
    const storage = memoryStorage();
    rememberPendingAuthorization("auth-3", storage, 0);
    expect(consumePendingAuthorization(storage, MCP_PENDING_AUTHORIZATION_TTL_MS + 1)).toBeNull();
  });

  it("survives right up to the ttl boundary", () => {
    const storage = memoryStorage();
    rememberPendingAuthorization("auth-4", storage, 0);
    expect(consumePendingAuthorization(storage, MCP_PENDING_AUTHORIZATION_TTL_MS)).toBe("auth-4");
  });

  it("rejects malformed, future-dated and tampered payloads", () => {
    const storage = memoryStorage();
    storage.setItem(MCP_PENDING_AUTHORIZATION_KEY, "not json");
    expect(consumePendingAuthorization(storage, 10)).toBeNull();

    storage.setItem(
      MCP_PENDING_AUTHORIZATION_KEY,
      JSON.stringify({ authorizationId: "ok", savedAt: 5000 }),
    );
    expect(consumePendingAuthorization(storage, 1000)).toBeNull();

    storage.setItem(
      MCP_PENDING_AUTHORIZATION_KEY,
      JSON.stringify({ authorizationId: "https://evil.example", savedAt: 1 }),
    );
    expect(consumePendingAuthorization(storage, 2)).toBeNull();
  });

  it("clears without throwing when nothing is stored", () => {
    const storage = memoryStorage();
    expect(() => clearPendingAuthorization(storage)).not.toThrow();
    expect(consumePendingAuthorization(storage, 1)).toBeNull();
  });
});

describe("assistant endpoint configuration", () => {
  it("exposes the public endpoint path", () => {
    expect(MCP_ENDPOINT_PATH).toBe("/api/public/mcp");
  });

  it("derives the path-aware discovery location", () => {
    expect(MCP_RESOURCE_METADATA_PATH).toBe("/.well-known/oauth-protected-resource/api/public/mcp");
  });

  it("builds an absolute endpoint url without doubling slashes", () => {
    expect(mcpEndpointUrl("https://example.com")).toBe("https://example.com/api/public/mcp");
    expect(mcpEndpointUrl("https://example.com/")).toBe("https://example.com/api/public/mcp");
  });
});
