/**
 * Signs private image addresses in batches.
 *
 * A list screen shows one private image per card, and each card used to ask
 * storage for its own signed address: thirty characters meant thirty requests.
 * Requests made in the same moment (one render of a list) are now collected
 * and sent as one `createSignedUrls` call per bucket.
 *
 * A failed batch, or a path storage refuses, resolves to `null`, the same as
 * a failed single request did.
 */
import { supabase } from "@/integrations/supabase/client";

type Signer = (bucket: string, paths: string[], seconds: number) => Promise<(string | null)[]>;

/** Paths per storage call; keeps request bodies small on very long lists. */
export const SIGN_BATCH_SIZE = 100;

type Pending = { path: string; resolve: (url: string | null) => void };

export function createSignedUrlBatcher(
  sign: Signer,
  schedule: (fn: () => void) => void = (fn) => void setTimeout(fn, 0),
) {
  const queues = new Map<string, { bucket: string; seconds: number; items: Pending[] }>();

  function flush(key: string) {
    const queue = queues.get(key);
    queues.delete(key);
    if (!queue) return;
    for (let i = 0; i < queue.items.length; i += SIGN_BATCH_SIZE) {
      const chunk = queue.items.slice(i, i + SIGN_BATCH_SIZE);
      const unique = [...new Set(chunk.map((item) => item.path))];
      sign(queue.bucket, unique, queue.seconds).then(
        (urls) => {
          const byPath = new Map(unique.map((path, index) => [path, urls[index] ?? null]));
          for (const item of chunk) item.resolve(byPath.get(item.path) ?? null);
        },
        () => {
          for (const item of chunk) item.resolve(null);
        },
      );
    }
  }

  return function signedUrl(bucket: string, path: string, seconds: number): Promise<string | null> {
    const key = `${bucket}\n${seconds}`;
    let queue = queues.get(key);
    if (!queue) {
      queue = { bucket, seconds, items: [] };
      queues.set(key, queue);
      schedule(() => flush(key));
    }
    const items = queue.items;
    return new Promise((resolve) => items.push({ path, resolve }));
  };
}

async function signWithStorage(bucket: string, paths: string[], seconds: number) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, seconds);
  if (error || !data) return paths.map(() => null);
  const byPath = new Map(data.map((row) => [row.path, row.error ? null : row.signedUrl]));
  return paths.map((path) => byPath.get(path) ?? null);
}

export const batchedSignedUrl = createSignedUrlBatcher(signWithStorage);
