import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "@/i18n/locale-context";
import { getProfilePreferences, setProfilePreferences } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { isSupportedLocale } from "@/i18n/config";

/**
 * Applies the language stored on the user's account once the profile loads,
 * and keeps the account in sync when the user picks another language.
 */
export function useAccountLocale() {
  const { user } = useSession();
  const { locale, setLocale, applyAccountLocale } = useLocale();
  const queryClient = useQueryClient();
  const applied = useRef(false);

  const { data } = useQuery({
    queryKey: ["profile-preferences", user?.id],
    queryFn: () => getProfilePreferences(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const accountLocale = typeof data?.locale === "string" ? data.locale : null;

  useEffect(() => {
    if (applied.current) return;
    if (!accountLocale || !isSupportedLocale(accountLocale)) return;
    applied.current = true;
    applyAccountLocale(accountLocale);
  }, [accountLocale, applyAccountLocale]);

  return {
    locale,
    change: (next: string) => {
      applied.current = true;
      setLocale(next);
      if (!user) return;
      void setProfilePreferences(user.id, { locale: next })
        .then(() => queryClient.invalidateQueries({ queryKey: ["profile-preferences", user.id] }))
        .catch(() => {
          /* the local choice still applies if the profile write fails */
        });
    },
  };
}
