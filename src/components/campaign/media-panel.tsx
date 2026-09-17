import { Suspense, lazy, useEffect, useState } from "react";
import { useT } from "@/i18n/hooks";
import { CampaignVideosPanel } from "@/components/campaign/intro-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollableTabsList, Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";

const SoundtrackPanel = lazy(() =>
  import("@/components/campaign/soundtrack-panel").then((mod) => ({
    default: mod.SoundtrackPanel,
  })),
);
const SoundFxPanel = lazy(() =>
  import("@/components/campaign/sound-fx-panel").then((mod) => ({ default: mod.SoundFxPanel })),
);

export type MediaTab = "videos" | "soundtrack" | "sound-fx";

function MediaFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  );
}

function useMediaT() {
  return useT("media");
}

export function MediaPanel({
  campaignId,
  isGm,
  sub = null,
  focusId = null,
}: {
  campaignId: string;
  isGm: boolean;
  sub?: MediaTab | null;
  focusId?: string | null;
}) {
  const { t } = useMediaT();
  const [tab, setTab] = useState<MediaTab>(sub ?? "videos");

  useEffect(() => {
    if (sub) setTab(sub);
  }, [sub, focusId]);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as MediaTab)}>
      <ScrollableTabsList className="max-w-xl">
        <TabsTrigger value="videos">{t("panel.tabs.videos")}</TabsTrigger>
        <TabsTrigger value="soundtrack">{t("panel.tabs.soundtrack")}</TabsTrigger>
        <TabsTrigger value="sound-fx">{t("panel.tabs.soundFx")}</TabsTrigger>
      </ScrollableTabsList>
      <TabsContent value="videos" className="mt-6">
        <CampaignVideosPanel campaignId={campaignId} isGm={isGm} />
      </TabsContent>
      <TabsContent value="soundtrack" className="mt-6">
        <Suspense fallback={<MediaFallback />}>
          <SoundtrackPanel campaignId={campaignId} isGm={isGm} />
        </Suspense>
      </TabsContent>
      <TabsContent value="sound-fx" className="mt-6">
        <Suspense fallback={<MediaFallback />}>
          <SoundFxPanel campaignId={campaignId} isGm={isGm} />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}

export default MediaPanel;
