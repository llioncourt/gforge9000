import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  staticData: { sitemap: false },
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
});