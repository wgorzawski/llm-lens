import type { TraceMessage } from "@llm-lens/types";

export function extractMessageSnippet(messages: TraceMessage[], maxLen = 500): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "";
  if (typeof first.content === "string") return first.content.slice(0, maxLen);
  const block = first.content.find((b) => b.type === "text");
  return block && "text" in block ? block.text.slice(0, maxLen) : "";
}
