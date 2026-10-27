import { describe, it, expect, afterEach } from "vitest";
import { computeCost, computeCostDetailed, findPrice, setPricingOverrides } from "../pricing.js";

describe("pricing", () => {
  afterEach(() => setPricingOverrides({}));

  it("prices plain input and output tokens", () => {
    expect(computeCost("claude-sonnet-4-6", 1_000_000, 1_000_000)).toBeCloseTo(18);
    expect(computeCost("gpt-4o-mini", 1_000_000, 0)).toBeCloseTo(0.15);
  });

  it("bills cache reads and writes at their own rates", () => {
    const cost = computeCostDetailed("claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3 + 0.3 + 3.75);
  });

  it("falls back to prefixes for dated model ids", () => {
    expect(findPrice("claude-haiku-4-5-20251001")).toEqual(findPrice("claude-haiku-4-5"));
    expect(findPrice("gpt-4o-2024-11-20")).toEqual(findPrice("gpt-4o"));
  });

  it("understands vendor-prefixed gateway ids (OpenRouter)", () => {
    expect(findPrice("anthropic/claude-sonnet-4.6", "openrouter")).toEqual(findPrice("claude-sonnet-4-6"));
    expect(findPrice("openai/gpt-4o-mini", "openrouter")).toEqual(findPrice("gpt-4o-mini"));
  });

  it("prices Groq models from the Groq table", () => {
    expect(computeCost("openai/gpt-oss-20b", 1_000_000, 1_000_000, "groq")).toBeCloseTo(0.375);
  });

  it("treats local Ollama models as free and unknown models as 0", () => {
    expect(computeCost("llama3.2", 1000, 1000, "ollama")).toBe(0);
    expect(computeCost("some-unknown-model", 1000, 1000)).toBe(0);
  });

  it("lets overrides win, globally or per provider", () => {
    setPricingOverrides({ "my-model": { in: 1, out: 2 }, "together:my-model": { in: 10, out: 20 } });
    expect(computeCost("my-model", 1_000_000, 1_000_000)).toBeCloseTo(3);
    expect(computeCost("my-model", 1_000_000, 1_000_000, "together")).toBeCloseTo(30);
  });
});
