import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { instrumentOpenAI, instrumentAnthropic } from "@llm-lens/instrument";

export interface Config {
  llmLensUrl: string;
  llmLensApiKey: string;
  anthropicApiKey: string;
  openaiApiKey: string;
}

export async function callAnthropic(prompt: string, config: Config): Promise<string> {
  const client = instrumentAnthropic(
    new Anthropic({ apiKey: config.anthropicApiKey, dangerouslyAllowBrowser: true }),
    { apiUrl: config.llmLensUrl, apiKey: config.llmLensApiKey },
  );

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content.find((b) => b.type === "text")?.text ?? "";
}

export async function callOpenAI(prompt: string, config: Config): Promise<string> {
  const client = instrumentOpenAI(
    new OpenAI({ apiKey: config.openaiApiKey, dangerouslyAllowBrowser: true }),
    { apiUrl: config.llmLensUrl, apiKey: config.llmLensApiKey },
  );

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0]?.message.content ?? "";
}
