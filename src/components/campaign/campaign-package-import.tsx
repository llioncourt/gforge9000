import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Download, Upload } from "lucide-react";
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
import { useT } from "@/i18n/hooks";

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
  const { t } = useT("campaigns");
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);

  const runImport = async (file: File, report: (label: string, percent?: number) => void) => {
    report(t("packageImport.readingZip"), 5);
    const summary = await importCampaignPackage(file, (step) => report(step));
    report(t("packageImport.refreshing"), 95);
    await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    setImportOpen(false);
    onImported(summary.campaignId);
    return t("packageImport.importedSummary", {
      entities: summary.entities,
      characters: summary.characters,
      maps: summary.maps,
      albums: summary.albums,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="mr-2 h-4 w-4" /> {t("packageImport.importButton")}
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              <BookOpen className="mr-2 h-4 w-4" /> {t("packageImport.formatButton")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>{t("packageImport.dialog.title")}</DialogTitle>
              <DialogDescription>{t("packageImport.dialog.description")}</DialogDescription>
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
                <Download className="mr-2 h-4 w-4" /> {t("packageImport.downloadGuide")}
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
                <Download className="mr-2 h-4 w-4" /> {t("packageImport.downloadExample")}
              </Button>
            </div>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-xs leading-relaxed">
              {buildCampaignPackageReadme()}
            </pre>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted-foreground">{t("packageImport.hint")}</p>
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t("packageImport.importDialog.title")}
        description={t("packageImport.importDialog.description")}
        accept=".zip,application/zip"
        label={t("packageImport.importDialog.label")}
        run={runImport}
      />
    </div>
  );
}
