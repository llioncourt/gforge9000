import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { createSignedUrlBatcher, SIGN_BATCH_SIZE } = await import("@/lib/signed-url-batch");

function manual() {
  const tasks: (() => void)[] = [];
  return {
    schedule: (fn: () => void) => void tasks.push(fn),
    run: () => tasks.splice(0).forEach((fn) => fn()),
  };
}

describe("signed URL batching", () => {
  it("signs every path requested together in one call per bucket", async () => {
    const tick = manual();
    const sign = vi.fn(async (bucket: string, paths: string[]) =>
      paths.map((p) => `https://x/${bucket}/${p}`),
    );
    const signedUrl = createSignedUrlBatcher(sign, tick.schedule);

    const results = Promise.all([
      signedUrl("portraits", "a.avif", 60),
      signedUrl("portraits", "b.avif", 60),
      signedUrl("portraits", "a.avif", 60),
      signedUrl("campaign-assets", "c.png", 60),
    ]);
    tick.run();

    expect(await results).toEqual([
      "https://x/portraits/a.avif",
      "https://x/portraits/b.avif",
      "https://x/portraits/a.avif",
      "https://x/campaign-assets/c.png",
    ]);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(sign).toHaveBeenCalledWith("portraits", ["a.avif", "b.avif"], 60);
    expect(sign).toHaveBeenCalledWith("campaign-assets", ["c.png"], 60);
  });

  it("splits very long lists into several calls", async () => {
    const tick = manual();
    const sign = vi.fn(async (_bucket: string, paths: string[]) => paths.map((p) => p));
    const signedUrl = createSignedUrlBatcher(sign, tick.schedule);

    const paths = Array.from({ length: SIGN_BATCH_SIZE + 5 }, (_, i) => `p${i}`);
    const results = Promise.all(paths.map((p) => signedUrl("portraits", p, 60)));
    tick.run();

    expect(await results).toEqual(paths);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("resolves to null when storage refuses a path or the whole call fails", async () => {
    const tick = manual();
    const sign = vi
      .fn<(bucket: string, paths: string[], seconds: number) => Promise<(string | null)[]>>()
      .mockResolvedValueOnce(["ok", null])
      .mockRejectedValueOnce(new Error("offline"));
    const signedUrl = createSignedUrlBatcher(sign, tick.schedule);

    const first = Promise.all([signedUrl("b", "ok", 60), signedUrl("b", "missing", 60)]);
    tick.run();
    expect(await first).toEqual(["ok", null]);

    const second = signedUrl("b", "any", 60);
    tick.run();
    expect(await second).toBeNull();
  });

  it("starts a fresh batch after the previous one was sent", async () => {
    const tick = manual();
    const sign = vi.fn(async (_bucket: string, paths: string[]) => paths);
    const signedUrl = createSignedUrlBatcher(sign, tick.schedule);

    const a = signedUrl("b", "one", 60);
    tick.run();
    const b = signedUrl("b", "two", 60);
    tick.run();

    expect([await a, await b]).toEqual(["one", "two"]);
    expect(sign).toHaveBeenCalledTimes(2);
  });
});
