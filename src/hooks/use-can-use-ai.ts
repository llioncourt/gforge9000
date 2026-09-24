import { useSession } from "@/hooks/use-session";
import { canUseAi } from "@/lib/ai-access";

export function useCanUseAi(): boolean {
  const { user } = useSession();
  return canUseAi(user?.email);
}
