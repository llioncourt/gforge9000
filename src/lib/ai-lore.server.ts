import type { LoreDraft } from "@/lib/ai-lore";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "summary", "fields"],
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value"],
        properties: { key: { type: "string" }, value: { type: "string" } },
      },
    },
  },
} as const;

function gatewayMessage(status: number, body: string): string {
  if (status === 402) return "The workspace is out of AI credits. Add credits to keep generating.";
  if (status === 403) return "AI generation is disabled for this workspace.";
  if (status === 429) return "Too many AI requests right now. Try again in a moment.";
  return `AI request failed (${status}). ${body.slice(0, 200)}`;
}

/** Streams the gateway call and returns the parsed draft. */
export async function requestLoreDraft(prompt: string): Promise<LoreDraft> {
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
              text: "You are a worldbuilding assistant for tabletop campaigns. You write original, system-neutral fiction and never reproduce text from published rulebooks.",
            },
          ],
        },
        { role: "user", content: [{ type: "input_text", text: prompt }] },
      ],
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      text: {
        format: {
          type: "json_schema",
          name: "lore_draft",
          strict: true,
          schema: DRAFT_SCHEMA,
        },
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

  if (!text.trim()) throw new Error("The AI returned an empty draft. Try again with more detail.");

  try {
    return JSON.parse(text) as LoreDraft;
  } catch {
    throw new Error("The AI draft could not be read. Try again.");
  }
}
