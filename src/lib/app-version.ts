export const APP_BUILD_ID = typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "test-build";

const APP_ASSET_PATTERN = /(?:src=["'])([^"']*\/assets\/index-[^"']+\.js)(?:["'])/i;

export function isNewBuildAvailable(loadedBuildId: string, deployedBuildId: unknown) {
  return (
    typeof deployedBuildId === "string" &&
    deployedBuildId.length > 0 &&
    deployedBuildId !== loadedBuildId
  );
}

export function extractAppAssetId(html: string) {
  return APP_ASSET_PATTERN.exec(html)?.[1] ?? null;
}

export function readLoadedAppAssetId(documentValue: Document = document) {
  const script = Array.from(documentValue.scripts).find((item) =>
    /\/assets\/index-[^/]+\.js(?:\?|$)/i.test(item.src),
  );
  if (!script) return null;

  try {
    return new URL(script.src, documentValue.baseURI).pathname;
  } catch {
    return null;
  }
}

export function isNewAppAssetAvailable(loadedAssetId: string | null, deployedAssetId: unknown) {
  return (
    typeof loadedAssetId === "string" &&
    loadedAssetId.length > 0 &&
    typeof deployedAssetId === "string" &&
    deployedAssetId.length > 0 &&
    deployedAssetId !== loadedAssetId
  );
}

/** Authoritative probe: a tiny JSON endpoint carrying the current build id. */
export async function fetchDeployedBuildId(signal?: AbortSignal) {
  const response = await fetch(`/api/public/version?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) throw new Error(`Version check failed (${response.status})`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("buildId" in payload)) return null;
  return typeof payload.buildId === "string" ? payload.buildId : null;
}

/**
 * Fallback only: used when `fetchDeployedBuildId` fails (e.g. the version
 * endpoint is unreachable or not deployed yet behind a proxy/CDN). Fetches
 * the published index HTML and extracts the current app asset path. Not run
 * in parallel with the primary probe — only as a rescue when it throws.
 */
export async function fetchDeployedAppAssetId(signal?: AbortSignal) {
  const response = await fetch(`/?__version_check=${Date.now()}`, {
    cache: "no-store",
    headers: {
      Accept: "text/html",
      "Cache-Control": "no-cache",
    },
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) throw new Error(`App asset check failed (${response.status})`);
  return extractAppAssetId(await response.text());
}

/**
 * Runs the authoritative version probe; only falls back to the index-HTML
 * asset probe when the primary one fails. Returns true when either probe
 * indicates a newer build/asset is published.
 */
export async function isUpdateAvailable(
  loadedBuildId: string,
  loadedAssetId: string | null,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const deployedBuildId = await fetchDeployedBuildId(signal);
    return isNewBuildAvailable(loadedBuildId, deployedBuildId);
  } catch {
    try {
      const deployedAssetId = await fetchDeployedAppAssetId(signal);
      return isNewAppAssetAvailable(loadedAssetId, deployedAssetId);
    } catch {
      return false;
    }
  }
}

export function refreshToLatestVersion(locationValue: Location = window.location) {
  const url = new URL(locationValue.href);
  url.searchParams.set("__app_refresh", Date.now().toString());
  locationValue.replace(url.toString());
}
