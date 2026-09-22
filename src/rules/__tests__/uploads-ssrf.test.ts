/**
 * TD-002: SSRF protection coverage for uploads.server.ts.
 *
 * `fetchRemoteFile` is disabled (see its doc comment for why resolve+pin
 * cannot be done safely in this runtime); these tests lock in that decision
 * plus every literal-address check `assertPublicHttpsUrl` still performs.
 */
import { describe, expect, it } from "vitest";
import { assertPublicHttpsUrl, fetchRemoteFile } from "@/lib/mcp/uploads.server";

describe("assertPublicHttpsUrl", () => {
  it("rejects plain http", () => {
    expect(() => assertPublicHttpsUrl("http://example.com/file.png")).toThrow();
  });

  it("rejects credentials in the URL", () => {
    expect(() => assertPublicHttpsUrl("https://user:pass@example.com/file.png")).toThrow();
  });

  it("accepts a plain public https URL", () => {
    expect(assertPublicHttpsUrl("https://example.com/file.png").hostname).toBe("example.com");
  });

  it.each([
    ["loopback", "https://127.0.0.1/x"],
    ["this-host", "https://0.0.0.0/x"],
    ["rfc1918 10/8", "https://10.1.2.3/x"],
    ["rfc1918 172.16/12", "https://172.16.0.5/x"],
    ["rfc1918 192.168/16", "https://192.168.1.1/x"],
    ["link-local incl. cloud metadata", "https://169.254.169.254/latest/meta-data"],
    ["cgnat", "https://100.64.0.1/x"],
    ["multicast/reserved", "https://224.0.0.1/x"],
  ])("rejects literal private IPv4: %s", (_label, url) => {
    expect(() => assertPublicHttpsUrl(url)).toThrow();
  });

  it.each([
    ["loopback", "https://[::1]/x"],
    ["unspecified", "https://[::]/x"],
    ["link-local", "https://[fe80::1]/x"],
    ["ULA fc", "https://[fc00::1]/x"],
    ["ULA fd", "https://[fd12:3456::1]/x"],
    ["IPv4-mapped private", "https://[::ffff:10.0.0.1]/x"],
    ["IPv4-mapped metadata", "https://[::ffff:169.254.169.254]/x"],
  ])("rejects literal IPv6: %s", (_label, url) => {
    expect(() => assertPublicHttpsUrl(url)).toThrow();
  });

  it.each([
    "https://localhost/x",
    "https://localhost.localdomain/x",
    "https://metadata/x",
    "https://metadata.google.internal/x",
    "https://instance-data/x",
    "https://foo.internal/x",
    "https://foo.local/x",
    "https://box.home.arpa/x",
  ])("rejects blocked hostnames and internal suffixes: %s", (url) => {
    expect(() => assertPublicHttpsUrl(url)).toThrow();
  });
});

describe("fetchRemoteFile (disabled — see doc comment for why)", () => {
  it("refuses every call, including public-looking URLs, without making a network request", async () => {
    await expect(
      fetchRemoteFile("https://example.com/file.png", {
        maxBytes: 1_000,
        allowedMime: ["image/png"],
      }),
    ).rejects.toThrow(/turned off for security reasons/i);
  });

  it("refuses a request even for an otherwise-blocked address, with the same plain-language error", async () => {
    await expect(
      fetchRemoteFile("https://169.254.169.254/latest/meta-data", {
        maxBytes: 1_000,
        allowedMime: ["image/png"],
      }),
    ).rejects.toThrow(/turned off for security reasons/i);
  });
});
