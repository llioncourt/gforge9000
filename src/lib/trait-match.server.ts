import { buildMatchPrompt, type MatchResolution, type UnmatchedItem } from "@/lib/trait-match";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "kind", "match"],
        properties: {
          source: { type: "string" },
          kind: { type: "string" },
          match: { type: "string" },
        },
      },
    },
  },
} as const;

function gatewayMessage(status: number, body: string): string {
  if (status === 402) return "The workspace is out of AI credits.";
  if (status === 403) return "AI matching is disabled for this workspace.";
  if (status === 429) return "Too many AI requests right now.";
  return `AI request failed (${status}). ${body.slice(0, 200)}`;
}

/** Asks the model to map imported trait names onto enabled library entries. */
export async function requestTraitMatches(
  items: UnmatchedItem[],
  candidates: UnmatchedItem[],
): Promise<MatchResolution[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You align imported character trait names with an existing content library. You only map names; you never invent game content or reproduce rulebook text.",
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildMatchPrompt(items, candidates) }],
        },
      ],
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      text: {
        format: { type: "json_schema", name: "trait_matches", strict: true, schema: MATCH_SCHEMA },
      },
    }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(gatewayMessage(response.status, body));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && event.response?.output_text) {
          if (!text) text = event.response.output_text;
        }
      } catch {
        // ignore keep-alive and non-JSON frames
      }
    }
  }

  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text) as { matches?: MatchResolution[] };
    return Array.isArray(parsed.matches) ? parsed.matches : [];
  } catch {
    return [];
  }
}
