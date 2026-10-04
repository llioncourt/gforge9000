/**
 * Pack covers: who may set one, which files are accepted, and that the stored
 * file and the pack row stay consistent when a cover is set, replaced or
 * removed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER = "user-1";

const state = vi.hoisted(() => ({
  packs: [] as Record<string, unknown>[],
  uploads: [] as { path: string; type: string }[],
  removed: [] as string[],
  inserted: [] as Record<string, unknown>[],
  failUpdate: false,
}));

vi.mock("@/integrations/supabase/client", () => {
  const table = () => {
    let insertRow: Record<string, unknown> | null = null;
    let patch: Record<string, unknown> | null = null;
    let id: string | null = null;
    const self: Record<string, unknown> = {};
    self["select"] = () => self;
    self["insert"] = (row: Record<string, unknown>) => {
      insertRow = row;
      return self;
    };
    self["update"] = (value: Record<string, unknown>) => {
      patch = value;
      return self;
    };
    self["eq"] = (column: string, value: string) => {
      if (column === "id") id = value;
      return self;
    };
    self["single"] = () => {
      if (insertRow) {
        const row = { id: `pack-${state.packs.length + 1}`, cover_path: null, ...insertRow };
        state.packs.push(row);
        state.inserted.push(row);
        return Promise.resolve({ data: row, error: null });
      }
      if (patch) {
        if (state.failUpdate) {
          return Promise.resolve({ data: null, error: { message: "update refused" } });
        }
        const row = state.packs.find((p) => p["id"] === id);
        if (!row) return Promise.resolve({ data: null, error: { message: "not found" } });
        Object.assign(row, patch);
        return Promise.resolve({ data: row, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    // A plain awaited select lists the signed-in user's own packs.
    self["then"] = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: state.packs.filter((p) => p["owner_id"] === USER),
        error: null,
      }).then(resolve);
    return self;
  };
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: USER } } } }),
      },
      from: () => table(),
      storage: {
        from: () => ({
          upload: (path: string, file: File) => {
            state.uploads.push({ path, type: file.type });
            return Promise.resolve({ error: null });
          },
          remove: (paths: string[]) => {
            state.removed.push(...paths);
            return Promise.resolve({ error: null });
          },
        }),
      },
    },
  };
});

vi.mock("@/lib/avif-convert.functions", () => ({ convertImageToAvif: vi.fn() }));

vi.mock("@/lib/image-avif", async (original) => {
  const actual = await original<typeof import("@/lib/image-avif")>();
  return {
    ...actual,
    convertToAvif: (file: File) =>
      Promise.resolve(new File(["avif"], actual.avifFileName(file.name), { type: "image/avif" })),
  };
});

const {
  PACK_COVER_SOURCE_MAX_BYTES,
  PackCoverError,
  canEditPackCover,
  clearPackCover,
  packCoverPathFor,
  packCoverProblem,
  savePackCover,
} = await import("@/lib/pack-cover");

type Pack = Parameters<typeof clearPackCover>[0];

const image = (name = "cover.png", type = "image/png") => new File(["pixels"], name, { type });

function seedPack(overrides: Record<string, unknown> = {}): Pack {
  const row = {
    id: `pack-${state.packs.length + 1}`,
    owner_id: USER,
    name: "Star Trek",
    cover_path: null,
    ...overrides,
  };
  state.packs.push(row);
  return row as unknown as Pack;
}

beforeEach(() => {
  state.packs.length = 0;
  state.uploads.length = 0;
  state.removed.length = 0;
  state.inserted.length = 0;
  state.failUpdate = false;
});

describe("which files are accepted as a pack cover", () => {
  it("accepts images and refuses everything else", () => {
    expect(packCoverProblem({ name: "a.png", type: "image/png", size: 10 })).toBeNull();
    expect(packCoverProblem({ name: "a.heic", type: "", size: 10 })).toBeNull();
    expect(packCoverProblem({ name: "a.json", type: "application/json", size: 10 })).toBe("type");
  });

  it("refuses empty and oversized files", () => {
    expect(packCoverProblem({ name: "a.png", type: "image/png", size: 0 })).toBe("empty");
    expect(
      packCoverProblem({ name: "a.png", type: "image/png", size: PACK_COVER_SOURCE_MAX_BYTES + 1 }),
    ).toBe("size");
  });
});

describe("who may set a pack's cover", () => {
  it("is the pack's owner, and nobody else", () => {
    expect(canEditPackCover({ pack: { owner_id: USER }, userId: USER, entries: [] })).toBe(true);
    expect(canEditPackCover({ pack: { owner_id: "other" }, userId: USER, entries: [] })).toBe(
      false,
    );
    expect(canEditPackCover({ pack: { owner_id: USER }, userId: null, entries: [] })).toBe(false);
  });

  it("for a pack that only exists on entries, is whoever owns entries in it", () => {
    expect(canEditPackCover({ pack: null, userId: USER, entries: [{ owner_id: USER }] })).toBe(
      true,
    );
    expect(canEditPackCover({ pack: null, userId: USER, entries: [{ owner_id: "other" }] })).toBe(
      false,
    );
    expect(canEditPackCover({ pack: null, userId: USER, entries: [] })).toBe(false);
  });
});

describe("setting a pack cover", () => {
  it("stores the file in the owner's pack-cover folder and records it on the pack", async () => {
    const pack = seedPack();
    const updated = await savePackCover({ pack, packName: "Star Trek", file: image() });

    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0]!.path).toMatch(new RegExp(`^${USER}/pack-cover/[0-9a-f-]+\\.avif$`));
    expect(state.uploads[0]!.type).toBe("image/avif");
    expect(updated.cover_path).toBe(state.uploads[0]!.path);
    expect(state.removed).toEqual([]);
  });

  it("removes the previous cover file once the new one is in place", async () => {
    const old = packCoverPathFor(USER);
    const pack = seedPack({ cover_path: old });
    const updated = await savePackCover({ pack, packName: "Star Trek", file: image() });

    expect(updated.cover_path).not.toBe(old);
    expect(state.removed).toEqual([old]);
  });

  it("keeps the previous cover and drops the new file when the pack cannot be updated", async () => {
    const old = packCoverPathFor(USER);
    const pack = seedPack({ cover_path: old });
    state.failUpdate = true;

    await expect(savePackCover({ pack, packName: "Star Trek", file: image() })).rejects.toThrow(
      "update refused",
    );
    expect(state.removed).toEqual([state.uploads[0]!.path]);
    expect(state.packs[0]!["cover_path"]).toBe(old);
  });

  it("refuses a non-image before anything is uploaded", async () => {
    const pack = seedPack();
    const attempt = savePackCover({
      pack,
      packName: "Star Trek",
      file: image("notes.json", "application/json"),
    });
    await expect(attempt).rejects.toBeInstanceOf(PackCoverError);
    expect(state.uploads).toEqual([]);
  });

  it("uses the owner's existing pack row when the name differs only by case", async () => {
    seedPack({ name: "star trek" });
    const updated = await savePackCover({ pack: undefined, packName: "Star Trek", file: image() });

    expect(state.inserted).toEqual([]);
    expect(updated.id).toBe("pack-1");
    expect(updated.cover_path).toBe(state.uploads[0]!.path);
  });

  it("creates the pack row when the pack so far exists only on entries", async () => {
    const updated = await savePackCover({ pack: null, packName: "Homebrew", file: image() });

    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({ name: "Homebrew", owner_id: USER });
    expect(updated.cover_path).toBe(state.uploads[0]!.path);
  });
});

describe("removing a pack cover", () => {
  it("clears the pack's cover and removes the file", async () => {
    const old = packCoverPathFor(USER);
    const pack = seedPack({ cover_path: old });
    const updated = await clearPackCover(pack);

    expect(updated.cover_path).toBeNull();
    expect(state.removed).toEqual([old]);
  });
});
