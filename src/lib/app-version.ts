export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "test-build";

export function isNewBuildAvailable(loadedBuildId: string, deployedBuildId: unknown) {
  return (
    typeof deployedBuildId === "string" &&
    deployedBuildId.length > 0 &&
    deployedBuildId !== loadedBuildId
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