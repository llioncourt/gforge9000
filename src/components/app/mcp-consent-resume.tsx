import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { consumePendingAuthorization } from "@/lib/mcp/pending-authorization";

/**
 * If someone was sent here by an external assistant while signed out, the
 * approval screen is reopened once they land signed in. Mounted on the
 * dashboard only; it does not participate in the auth flow itself.
 */
export function McpConsentResume() {
  const navigate = useNavigate();

  useEffect(() => {
    const authorizationId = consumePendingAuthorization();
    if (!authorizationId) return;
    void navigate({ to: "/oauth/consent", search: { authorization_id: authorizationId } });
  }, [navigate]);

  return null;
}
