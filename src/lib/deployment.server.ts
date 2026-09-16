import { createServerFn } from "@tanstack/react-start";

// This value is fixed when the server starts/deploys.
// In a real build pipeline, you could replace this with a Git hash or build ID.
const DEPLOYMENT_ID = Date.now().toString();

export const getDeploymentId = createServerFn("GET", async () => {
  return { id: DEPLOYMENT_ID };
});
