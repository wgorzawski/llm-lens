import type { UnifiedTrace } from "@llm-lens/types";

export type ParseResult =
  | { success: true; trace: UnifiedTrace }
  | { success: false; error: string };
