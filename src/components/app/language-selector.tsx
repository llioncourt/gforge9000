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
import { useLocale } from "@/i18n/locale-context";
import { useAccountLocale } from "@/components/app/use-account-locale";
import { useT } from "@/i18n/hooks";

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
