import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/provider";
import { useT } from "@/i18n/hooks";
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
        .then(() =>
          queryClient.invalidateQueries({ queryKey: ["profile-preferences", user.id] }),
        )
        .catch(() => {
          /* the local choice still applies if the profile write fails */
        });
    },
  };
}

/**
 * Global language selector. Reads the language list from the central i18n
 * config, so adding a locale never requires touching this component.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const { locales, definition } = useLocale();
  const { locale, change } = useAccountLocale();
  const { t } = useT("common");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label={t("language.change")}
          title={t("language.current", { language: definition.nativeName })}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((item) => (
          <DropdownMenuItem
            key={item.code}
            onSelect={() => change(item.code)}
            className="flex items-center justify-between gap-2"
          >
            <span>{item.nativeName}</span>
            {item.code === locale ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
