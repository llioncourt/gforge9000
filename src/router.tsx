import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Fewer redundant network round-trips: served data stays fresh for a
        // short window and window focus no longer refetches everything.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Fetch the next screen's code as soon as a link is hovered or touched, so
    // opening it does not start with a download. Screens load their data
    // through queries after they mount, so this fetches code only.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
