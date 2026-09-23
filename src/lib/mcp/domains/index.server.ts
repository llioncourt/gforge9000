/**
 * Single registry for every assistant (MCP) tool, base and domain alike.
 *
 * `registerAllTools` is the one place that lists every registrar, in
 * registration order. `MCP_TOOL_NAMES` is derived by calling that same
 * registrar list against a name-collecting fake registrar, so the public
 * tool-name list can never drift from what actually gets registered on a
 * real server.
 */

import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";

import { registerCampaigns } from "@/lib/mcp/domains/campaigns.server";
import { registerEntries } from "@/lib/mcp/domains/entries.server";
import { registerRelationships } from "@/lib/mcp/domains/relationships.server";
import { registerCharacters } from "@/lib/mcp/domains/characters.server";
import { registerCharacterEntries } from "@/lib/mcp/domains/character-entries.server";
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

/**
 * Every registrar function, in the exact order tools are exposed. This is the
 * single list that both `registerAllTools` and `MCP_TOOL_NAMES` are built
 * from — nothing else may register or enumerate tools.
 */
const REGISTRARS: ((tool: ToolRegistrar, ctx: McpToolContext) => void)[] = [
  registerCampaigns,
  registerEntries,
  registerRelationships,
  registerCharacters,
  registerCharacterEntries,
  registerCampaignMembers,
  registerCampaignKnowledge,
  registerCampaignNotifications,
  registerCampaignNotes,
  registerSessionChronicles,
  registerHistory,
  registerMaps,
  registerDice,
  registerCharacterRuntime,
  registerCampaignAssets,
  registerCampaignAudio,
  registerCampaignVideos,
  registerCharacterPortrait,
  registerLibrary,
  registerCampaignPackage,
  registerAdaptation,
];

/** Registers every tool this server exposes against a real ToolRegistrar. */
export function registerAllTools(tool: ToolRegistrar, ctx: McpToolContext): void {
  for (const register of REGISTRARS) register(tool, ctx);
}

/**
 * Names of every tool this server exposes, in registration order. Derived by
 * running the exact same registrars against a name-collecting stand-in
 * registrar, so this list can never drift from what `registerAllTools`
 * actually registers on a real MCP server.
 */
export const MCP_TOOL_NAMES: readonly string[] = (() => {
  const names: string[] = [];
  const collect: ToolRegistrar = (name) => {
    names.push(name);
  };
  const fakeCtx = {} as McpToolContext;
  for (const register of REGISTRARS) register(collect, fakeCtx);
  return names;
})();
