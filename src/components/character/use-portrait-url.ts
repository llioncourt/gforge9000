import { useQuery } from "@tanstack/react-query";
import { portraitUrl } from "@/lib/portrait";

export function usePortraitUrl(path: string | null | undefined) {
  const query = useQuery({
    queryKey: ["portrait", path ?? "none"],
    queryFn: () => portraitUrl(path),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });
  return path ? (query.data ?? null) : null;
}
