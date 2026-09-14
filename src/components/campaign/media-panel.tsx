import { Suspense, lazy } from "react";
import { CampaignVideosPanel } from "@/components/campaign/intro-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollableTabsList, Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";

const SoundtrackPanel = lazy(() => import("@/components/campaign/soundtrack-panel").then((mod) => ({ default: mod.SoundtrackPanel })));
const SoundFxPanel = lazy(() => import("@/components/campaign/sound-fx-panel").then((mod) => ({ default: mod.SoundFxPanel })));

function MediaFallback() {
  return <div className="space-y-3"><Skeleton className="h-40 w-full rounded-lg" /><Skeleton className="h-24 w-full rounded-lg" /></div>;
}

export function MediaPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  return <Tabs defaultValue="videos"><ScrollableTabsList className="max-w-xl"><TabsTrigger value="videos">Videos</TabsTrigger><TabsTrigger value="soundtrack">Soundtrack</TabsTrigger><TabsTrigger value="sound-fx">Sound FX</TabsTrigger></ScrollableTabsList><TabsContent value="videos" className="mt-6"><CampaignVideosPanel campaignId={campaignId} isGm={isGm} /></TabsContent><TabsContent value="soundtrack" className="mt-6"><Suspense fallback={<MediaFallback />}><SoundtrackPanel campaignId={campaignId} isGm={isGm} /></Suspense></TabsContent><TabsContent value="sound-fx" className="mt-6"><Suspense fallback={<MediaFallback />}><SoundFxPanel campaignId={campaignId} isGm={isGm} /></Suspense></TabsContent></Tabs>;
}