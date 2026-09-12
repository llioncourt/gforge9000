import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AI_IMPORT_GUIDES, type GuideKind } from "@/lib/ai-import-guides";
import { download } from "@/lib/portable";
import { cn } from "@/lib/utils";

const HELP =
  "Give this Markdown file and your source PDF to an AI. It explains exactly how to produce a valid import file for this importer.";

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
  const guide = AI_IMPORT_GUIDES[kind];
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("w-full whitespace-normal sm:w-auto", className)}
            title={HELP}
            onClick={() => download(guide.filename, guide.markdown, "text/markdown;charset=utf-8")}
          >
            <FileDown className="mr-2 h-4 w-4 shrink-0" />
            Download AI conversion guide (.md)
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{HELP}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
