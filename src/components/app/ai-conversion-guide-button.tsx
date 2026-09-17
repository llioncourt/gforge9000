import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AI_IMPORT_GUIDES, type GuideKind } from "@/lib/ai-import-guides";
import { download } from "@/lib/portable";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/hooks";

/**
 * Downloads the importer-specific Markdown guide. Purely local: the file is
 * generated from the same constants the parsers use, so no network fetch.
 */
export function AiConversionGuideButton({
  kind,
  className,
}: {
  kind: GuideKind;
  className?: string;
}) {
  const { t } = useT("common");
  const help = t("aiGuide.help");
  const guide = AI_IMPORT_GUIDES[kind];
  return (
    <div className={cn("grid gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full whitespace-normal sm:w-auto sm:justify-self-start"
        title={help}
        aria-describedby={`guide-help-${kind}`}
        onClick={() => download(guide.filename, guide.markdown, "text/markdown;charset=utf-8")}
      >
        <FileDown className="mr-2 h-4 w-4 shrink-0" />
        {t("aiGuide.download")}
      </Button>
      <p id={`guide-help-${kind}`} className="text-xs text-muted-foreground">
        {help}
      </p>
    </div>
  );
}
