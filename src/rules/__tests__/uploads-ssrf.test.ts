/**
 * TD-002: SSRF protection coverage for uploads.server.ts.
 *
 * `fetchRemoteFile` is disabled (see its doc comment for why resolve+pin
 * cannot be done safely in this runtime); these tests lock in that decision
 * plus every literal-address check `assertPublicHttpsUrl` still performs.
 */
import { describe, expect, it } from "vitest";
import { assertPublicHttpsUrl, fetchRemoteImage, sniffImage } from "@/lib/mcp/uploads.server";

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

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03,
  0x20, 0, 0, 0x02, 0x58, 8, 6, 0, 0, 0,
]);
const OK = "https://s.3daistudio.com/a.png";

function fakeFetch(responses: Response[]) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("fetchRemoteImage", () => {
  it("downloads an allowed png and reads its size from the bytes", async () => {
    const { impl } = fakeFetch([new Response(PNG, { headers: { "content-type": "text/plain" } })]);
    const file = await fetchRemoteImage(OK, { fetchImpl: impl });
    expect(file).toMatchObject({ mime: "image/png", width: 800, height: 600, ext: "png" });
  });

  it.each([
    "https://example.com/a.png",
    "http://s.3daistudio.com/a.png",
    "https://127.0.0.1/a.png",
    "https://localhost/a.png",
    "https://s.3daistudio.com:8443/a.png",
  ])("refuses %s without a request", async (url) => {
    const { impl, calls } = fakeFetch([]);
    await expect(fetchRemoteImage(url, { fetchImpl: impl })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("follows a redirect to another allowed host", async () => {
    const { impl, calls } = fakeFetch([
      new Response(null, {
        status: 302,
        headers: { location: "https://3dai-service-fs.fsn1.your-objectstorage.com/b.png" },
      }),
      new Response(PNG),
    ]);
    await fetchRemoteImage(OK, { fetchImpl: impl });
    expect(calls).toHaveLength(2);
  });

  it("refuses a redirect to a host outside the list", async () => {
    const { impl, calls } = fakeFetch([
      new Response(null, { status: 302, headers: { location: "https://169.254.169.254/x" } }),
    ]);
    await expect(fetchRemoteImage(OK, { fetchImpl: impl })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("refuses non-image content even with an image content-type", async () => {
    const { impl } = fakeFetch([
      new Response("<html></html>", { headers: { "content-type": "image/png" } }),
    ]);
    await expect(fetchRemoteImage(OK, { fetchImpl: impl })).rejects.toThrow(/JPEG, PNG or WebP/);
  });

  it("refuses files over 15 MB", async () => {
    const big = new Uint8Array(15 * 1024 * 1024 + 1);
    big.set(PNG);
    const { impl } = fakeFetch([new Response(big)]);
    await expect(fetchRemoteImage(OK, { fetchImpl: impl })).rejects.toThrow(/too large/);
  });

  it("identifies jpeg and webp by content", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 0x40, 0, 0x80, 0, 0]);
    expect(sniffImage(jpeg)).toMatchObject({ mime: "image/jpeg", width: 128, height: 64 });
    const webp = new Uint8Array(30);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58]);
    webp.set([99, 0, 0, 49, 0, 0], 24);
    expect(sniffImage(webp)).toMatchObject({ mime: "image/webp", width: 100, height: 50 });
  });
});
