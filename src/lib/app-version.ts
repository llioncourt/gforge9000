export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "test-build";

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

export function refreshToLatestVersion(locationValue: Location = window.location) {
  const url = new URL(locationValue.href);
  url.searchParams.set("__app_refresh", Date.now().toString());
  locationValue.replace(url.toString());
}