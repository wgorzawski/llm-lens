/** Vercel AI SDK telemetry log (via experimental_telemetry) */
export interface VercelAIRawLog {
  /** AI SDK span type */
  type: "ai.generateText" | "ai.streamText" | "ai.generateObject" | "ai.embed";
  operationId?: string;
  model?: string;
  provider?: string;
  timestamp?: number;
  durationMs?: number;
  input: VercelAIInput;
  output: VercelAIOutput;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

export interface VercelAIInput {
  prompt?: string;
  messages?: VercelAIMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export type VercelAIMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | VercelAIContentPart[];
};

export type VercelAIContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string | URL; mimeType?: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: unknown; isError?: boolean };

export interface VercelAIOutput {
  text?: string;
  toolCalls?: Array<{
    type: "tool-call";
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    type: "tool-result";
    toolCallId: string;
    toolName: string;
    result: unknown;
    isError?: boolean;
  }>;
  finishReason?: "stop" | "length" | "tool-calls" | "content-filter" | "error" | "other" | "unknown";
  object?: unknown;
}
