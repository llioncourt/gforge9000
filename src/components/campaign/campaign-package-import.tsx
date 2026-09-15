import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "@/components/ui/transfer-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { importCampaignPackage } from "@/lib/campaign-package-import";
import { buildCampaignPackageReadme, CAMPAIGN_PACKAGE_EXAMPLE } from "@/lib/campaign-package-docs";

function downloadText(fileName: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** ZIP import + format documentation, shown inside the New campaign dialog. */
export function CampaignPackageImport({
  onImported,
}: {
  onImported: (campaignId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);

  const runImport = async (file: File, report: (label: string, percent?: number) => void) => {
    report("Reading the ZIP…", 5);
    const summary = await importCampaignPackage(file, (step) => report(step));
    report("Refreshing campaigns…", 95);
    await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    setImportOpen(false);
    onImported(summary.campaignId);
    return `Campaign imported — ${summary.entities} lore entries, ${summary.characters} characters, ${summary.maps} maps, ${summary.albums} albums.`;
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="mr-2 h-4 w-4" /> Import package
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              <BookOpen className="mr-2 h-4 w-4" /> Package format
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>Campaign package format</DialogTitle>
              <DialogDescription>
                Everything a ZIP can carry into a new campaign, and where each file goes.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadText(
                    "campaign-package-format.md",
                    buildCampaignPackageReadme(),
                    "text/markdown",
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Download the guide
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadText(
                    "campaign.example.json",
                    CAMPAIGN_PACKAGE_EXAMPLE,
                    "application/json",
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Example campaign.json
              </Button>
            </div>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-xs leading-relaxed">
              {buildCampaignPackageReadme()}
            </pre>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted-foreground">
        A ZIP can carry the premise, house rules, lore, notes, handouts, battle maps, soundtracks,
        the intro video and character sheets.
      </p>
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import campaign package"
        description="campaign.json at the root, plus the files it references."
        accept=".zip,application/zip"
        label="Drop the campaign ZIP here, or click to browse"
        run={runImport}
      />
    </div>
  );
}
