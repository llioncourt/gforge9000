import { useEffect, useState } from "react";
import { getDeploymentId } from "@/lib/deployment.server";
import { toast } from "sonner";

const CHECK_INTERVAL = 1000 * 60 * 5; // 5 minutes

export function useDeploymentCheck() {
  const [initialId, setInitialId] = useState<string | null>(null);

  useEffect(() => {
    // Skip checking during development to avoid noise
    if (import.meta.env.DEV) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const check = async () => {
      try {
        const { id } = await getDeploymentId();
        
        if (!initialId) {
          // Store the version active when the user first loaded the tab
          setInitialId(id);
        } else if (id !== initialId) {
          // A new deployment ID means the server has been updated
          toast.info("Update Available", {
            description: "A new version of the app has been published. Refresh to get the latest features.",
            duration: Infinity,
            action: {
              label: "Refresh Now",
              onClick: () => window.location.reload(),
            },
          });
          // Stop polling once the user has been notified to avoid duplicate toasts
          return;
        }
      } catch (err) {
        // Silently fail to avoid disrupting the user experience
        console.warn("Deployment check failed:", err);
      }
      
      timeoutId = setTimeout(check, CHECK_INTERVAL);
    };

    check();

    return () => clearTimeout(timeoutId);
  }, [initialId]);
}
