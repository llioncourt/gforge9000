/**
 * Domain tools: one discoverable assistant tool per area of the app, each
 * routed by a required `action` field with its own strict schema.
 */

import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";

import { registerCampaignMembers } from "@/lib/mcp/domains/campaign-members.server";
import { registerCampaignKnowledge } from "@/lib/mcp/domains/campaign-knowledge.server";
import { registerCampaignNotifications } from "@/lib/mcp/domains/campaign-notifications.server";
import { registerCampaignNotes } from "@/lib/mcp/domains/campaign-notes.server";
import { registerSessionChronicles } from "@/lib/mcp/domains/session-chronicles.server";
import { registerHistory } from "@/lib/mcp/domains/history.server";
import { registerMaps } from "@/lib/mcp/domains/maps.server";
import { registerDice } from "@/lib/mcp/domains/dice.server";
import { registerCharacterRuntime } from "@/lib/mcp/domains/character-runtime.server";
import { registerCampaignAssets } from "@/lib/mcp/domains/campaign-assets.server";
import { registerCampaignAudio } from "@/lib/mcp/domains/campaign-audio.server";
import { registerCampaignVideos } from "@/lib/mcp/domains/campaign-videos.server";
import { registerCharacterPortrait } from "@/lib/mcp/domains/character-portrait.server";
import { registerLibrary } from "@/lib/mcp/domains/library.server";
import { registerCampaignPackage } from "@/lib/mcp/domains/campaign-package.server";
import { registerAdaptation } from "@/lib/mcp/domains/adaptation.server";

/** Registration order matches DOMAIN_TOOL_NAMES below. */
export function registerDomainTools(tool: ToolRegistrar, ctx: McpToolContext): void {
  registerCampaignMembers(tool, ctx);
  registerCampaignKnowledge(tool, ctx);
  registerCampaignNotifications(tool, ctx);
  registerCampaignNotes(tool, ctx);
  registerSessionChronicles(tool, ctx);
  registerHistory(tool, ctx);
  registerMaps(tool, ctx);
  registerDice(tool, ctx);
  registerCharacterRuntime(tool, ctx);
  registerCampaignAssets(tool, ctx);
  registerCampaignAudio(tool, ctx);
  registerCampaignVideos(tool, ctx);
  registerCharacterPortrait(tool, ctx);
  registerLibrary(tool, ctx);
  registerCampaignPackage(tool, ctx);
  registerAdaptation(tool, ctx);
}

export const DOMAIN_TOOL_NAMES = [
  "campaign_members",
  "campaign_knowledge",
  "campaign_notifications",
  "campaign_notes",
  "session_chronicles",
  "history",
  "maps",
  "dice",
  "character_runtime",
  "campaign_assets",
  "campaign_audio",
  "campaign_videos",
  "character_portrait",
  "library",
  "campaign_package",
  "adaptation",
] as const;
