/**
 * Demo seed script — populates a fresh LLM Lens instance with realistic demo data.
 * Idempotent: skips seeding if traces already exist.
 *
 * Usage:
 *   API_URL=http://localhost:3032 tsx scripts/seed-demo.ts
 */

const API_URL = (process.env["API_URL"] ?? "http://localhost:3032").replace(/\/$/, "");
const BASE = `${API_URL}/api`;

const DEMO_EMAIL = "demo@llmlens.dev";
const DEMO_PASSWORD = "demo1234";

// ── helpers ───────────────────────────────────────────────────────────────────

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── auth ──────────────────────────────────────────────────────────────────────

async function registerOrLogin(): Promise<string> {
  try {
    const res = await fetch(`${BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
    });
    if (res.ok) {
      const data = (await res.json()) as { token: string };
      console.log("  ✓ Registered demo user");
      return data.token;
    }
  } catch {}

  const data = (await api("POST", "/auth/login", {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  })) as { token: string };
  console.log("  ✓ Logged in as demo user");
  return data.token;
}

// ── trace seeders ─────────────────────────────────────────────────────────────

interface AnthropicPayload {
  request: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    system?: string;
    max_tokens: number;
    tools?: unknown[];
  };
  response: {
    id: string;
    type: "message";
    role: "assistant";
    content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
    model: string;
    stop_reason: string;
    stop_sequence: null;
    usage: { input_tokens: number; output_tokens: number };
  };
  timestamp: string;
  durationMs: number;
}

interface OpenAIPayload {
  request: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
    system?: string;
  };
  response: {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: Array<{
      index: number;
      message: { role: "assistant"; content: string };
      finish_reason: string;
    }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
  timestamp: string;
  durationMs: number;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedAnthropic(token: string, p: AnthropicPayload): Promise<string> {
  const data = (await api("POST", "/traces/anthropic", p, token)) as { id: string };
  return data.id;
}

async function seedOpenAI(token: string, p: OpenAIPayload): Promise<string> {
  const data = (await api("POST", "/traces/openai", p, token)) as { id: string };
  return data.id;
}

async function starTrace(token: string, id: string) {
  await api("PATCH", `/traces/${id}`, { starred: true }, token);
}

async function addNote(token: string, id: string, body: string) {
  await api("POST", `/traces/${id}/notes`, { body }, token);
}

// ── trace definitions ─────────────────────────────────────────────────────────
// Size tiers (input / output tokens, durationMs):
//   XS  :  15-40   /   25-80    /  80-250ms
//   S   :  40-120  /   80-200   /  250-700ms
//   M   : 120-350  /  200-500   /  700-1800ms
//   L   : 350-900  /  500-1200  / 1800-4500ms
//   XL  : 900-3000 / 1200-4000  / 4500-12000ms

async function seedAllTraces(token: string): Promise<{ starred: string[]; noted: Array<[string, string]> }> {
  const starred: string[] = [];
  const noted: Array<[string, string]> = [];

  // ══ XS — tiny, one-shot ══════════════════════════════════════════════════════

  // XS-1. Translate a phrase — haiku, <150ms, 2d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Translate 'The deployment is complete.' into Polish, German, and French." }],
      max_tokens: 128,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "**Polish:** Wdrożenie zostało zakończone.\n**German:** Die Bereitstellung ist abgeschlossen.\n**French:** Le déploiement est terminé." }],
      model: "claude-haiku-4-5", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 22, output_tokens: 48 },
    },
    timestamp: daysAgo(2), durationMs: 142,
  });

  // XS-2. One-liner CSS centering — gpt-4o-mini, very fast, 3d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "How do I center a div both horizontally and vertically using CSS Grid in one line?" }],
      max_tokens: 128,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-mini",
      choices: [{ index: 0, message: { role: "assistant", content: "```css\n.container {\n  display: grid;\n  place-items: center;\n}\n```\n`place-items: center` is shorthand for `align-items + justify-items`. Give the container a defined height." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 20, completion_tokens: 44, total_tokens: 64 },
    },
    timestamp: daysAgo(3), durationMs: 178,
  });

  // XS-3. TL;DR — gpt-4o-mini, instant, 7d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "TL;DR in one sentence: The transformer architecture introduced self-attention mechanisms that allow models to weigh the relevance of different input tokens when generating each output token, enabling parallelization that RNNs couldn't achieve." }],
      max_tokens: 64,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-mini",
      choices: [{ index: 0, message: { role: "assistant", content: "Transformers use self-attention to dynamically focus on relevant input tokens in parallel, solving the sequential bottleneck that limited earlier RNN architectures." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 58, completion_tokens: 28, total_tokens: 86 },
    },
    timestamp: daysAgo(7), durationMs: 112,
  });

  // XS-4. Regex one-liner — haiku, 6d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Regex to validate email with subdomains and plus addressing?" }],
      max_tokens: 128,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "```\n/^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$/\n```\nCovers `user+tag@mail.company.co.uk`. For production prefer `zod`'s `z.string().email()` — full RFC 5322 is too complex to regex reliably." }],
      model: "claude-haiku-4-5", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 19, output_tokens: 72 },
    },
    timestamp: daysAgo(6), durationMs: 198,
  });

  // ══ S — short, focused ═══════════════════════════════════════════════════════

  // S-1. Async/await explanation — haiku, 14h ago
  const s1 = await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Explain async/await in JavaScript with a concise practical example." }],
      max_tokens: 512,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "Async/await is syntactic sugar over Promises that makes asynchronous code read like synchronous code.\n\n```javascript\n// Without async/await\nfetch('/api/user')\n  .then(r => r.json())\n  .then(user => console.log(user))\n  .catch(err => console.error(err));\n\n// With async/await\nasync function loadUser() {\n  try {\n    const response = await fetch('/api/user');\n    const user = await response.json();\n    console.log(user);\n  } catch (err) {\n    console.error(err);\n  }\n}\n```\n\n`await` pauses execution inside the `async` function until the Promise resolves, without blocking the main thread." }],
      model: "claude-haiku-4-5", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 18, output_tokens: 154 },
    },
    timestamp: hoursAgo(14), durationMs: 284,
  });
  starred.push(s1);

  // S-2. SQL top-10 query — sonnet, 4d ago
  const s2 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Write a SQL query to find the top 10 customers by total order value in the last 90 days, including their email and order count." }],
      max_tokens: 512,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "```sql\nSELECT\n  c.email,\n  COUNT(o.id)          AS order_count,\n  SUM(o.total_amount)  AS total_value\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.created_at >= NOW() - INTERVAL '90 days'\n  AND o.status = 'completed'\nGROUP BY c.id, c.email\nORDER BY total_value DESC\nLIMIT 10;\n```\n\nFiltering by `status = 'completed'` prevents refunded/cancelled orders from inflating totals. If you need all statuses, remove that clause." }],
      model: "claude-sonnet-4-6", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 44, output_tokens: 128 },
    },
    timestamp: daysAgo(4), durationMs: 468,
  });
  starred.push(s2);

  // S-3. TypeScript type vs interface — haiku with system prompt, 5d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      system: "You are a senior TypeScript developer. Give precise, opinionated answers. No preamble.",
      messages: [{ role: "user", content: "Practical difference between `type` and `interface` in TypeScript? When to use each?" }],
      max_tokens: 512,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "Use **`interface`** for object shapes you expect others to extend or implement — it supports declaration merging and is better for OOP patterns.\n\nUse **`type`** for everything else: unions, intersections, mapped types, conditional types, tuples.\n\n```typescript\n// Interface — extensible object shapes\ninterface User { id: string; email: string; }\ninterface AdminUser extends User { permissions: string[]; }\n\n// Type — unions and computed types\ntype Status = 'idle' | 'loading' | 'error';\ntype Nullable<T> = T | null;\ntype Keys = keyof User; // 'id' | 'email'\n```\n\nDefault to `type`, switch to `interface` only when you need declaration merging." }],
      model: "claude-haiku-4-5", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 52, output_tokens: 168 },
    },
    timestamp: daysAgo(5), durationMs: 388,
  });

  // S-4. Email cold outreach — gpt-4o-mini, 2d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Write a short cold outreach email for a B2B SaaS analytics product targeting CTOs of Series A startups. Keep it under 100 words." }],
      max_tokens: 256,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-mini",
      choices: [{ index: 0, message: { role: "assistant", content: "Subject: Cut your p95 LLM latency — without guessing\n\nHi [Name],\n\nAs you scale your AI features, production blind spots get expensive fast — slow prompts, runaway costs, regressions that slip past evals.\n\nWe built LLM Lens to give CTOs a real-time view of every model call: latency, token spend, error rates, and diffs across prompt versions.\n\n5-minute integration, no infrastructure required.\n\nWould a 20-minute demo be worth your time next week?\n\nBest,\n[Sender]" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 40, completion_tokens: 98, total_tokens: 138 },
    },
    timestamp: daysAgo(2), durationMs: 322,
  });

  // S-5. Blog post outline — gpt-4o-mini, 8d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Create a blog post outline for 'How to monitor LLM costs in production'. Target audience: backend engineers. 5 sections max." }],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-mini",
      choices: [{ index: 0, message: { role: "assistant", content: "**How to Monitor LLM Costs in Production**\n\n**1. Why LLM costs spiral unexpectedly**\n- Token pricing models (input vs output asymmetry)\n- The hidden cost of retries and streaming\n- Real example: $4k/month surprise bill\n\n**2. Instrument every call**\n- Wrapping the SDK vs middleware approach\n- What to capture: model, tokens, latency, user_id, feature_flag\n- Structured logging vs trace storage\n\n**3. Build cost attribution**\n- Tagging by team, feature, and environment\n- Cost per user / cost per API call\n- Anomaly detection thresholds\n\n**4. Alerting that doesn't cry wolf**\n- Budget alerts vs spend-rate alerts\n- Per-model vs aggregate ceilings\n- Runbook: what to do when you hit 80% of budget\n\n**5. Optimizing after you can measure**\n- Cache hit rate as a leading indicator\n- Model downgrades: when haiku is good enough\n- Prompt compression ROI" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 40, completion_tokens: 212, total_tokens: 252 },
    },
    timestamp: daysAgo(8), durationMs: 512,
  });

  // ══ M — medium, typical workload ═════════════════════════════════════════════

  // M-1. TypeScript debounce — sonnet, 2d ago
  const m1 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Write a TypeScript utility function that debounces function calls. Include proper generic types, cancellation support, a flush method, and a usage example." }],
      max_tokens: 1024,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "Here's a fully-typed debounce with cancellation and flush:\n\n```typescript\ninterface DebouncedFn<T extends (...args: unknown[]) => void> {\n  (...args: Parameters<T>): void;\n  cancel(): void;\n  flush(...args: Parameters<T>): void;\n}\n\nfunction debounce<T extends (...args: unknown[]) => void>(\n  fn: T,\n  delay: number,\n): DebouncedFn<T> {\n  let timer: ReturnType<typeof setTimeout> | null = null;\n\n  const debounced = (...args: Parameters<T>) => {\n    if (timer !== null) clearTimeout(timer);\n    timer = setTimeout(() => {\n      fn(...args);\n      timer = null;\n    }, delay);\n  };\n\n  debounced.cancel = () => {\n    if (timer !== null) { clearTimeout(timer); timer = null; }\n  };\n\n  debounced.flush = (...args: Parameters<T>) => {\n    debounced.cancel();\n    fn(...args);\n  };\n\n  return debounced;\n}\n\n// Usage\nconst handleSearch = debounce((query: string) => {\n  console.log('Searching for:', query);\n}, 300);\n\nhandleSearch('hell');   // cancelled\nhandleSearch('hello');  // fires after 300ms\nhandleSearch.flush('hello world'); // fires immediately\nhandleSearch.cancel(); // prevents any pending call\n```\n\nThe `DebouncedFn` interface lets callers see `.cancel()` and `.flush()` without casting. `flush` is useful in form submit handlers where you want the latest value immediately." }],
      model: "claude-sonnet-4-6", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 38, output_tokens: 298 },
    },
    timestamp: daysAgo(2), durationMs: 882,
  });
  starred.push(m1);

  // M-2. Python sales script — sonnet, 2d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Write a Python script that reads a CSV file of sales data (columns: date, product, quantity, price) and outputs a summary: total revenue per product, sorted descending, with a grand total." }],
      max_tokens: 1024,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "```python\nimport csv\nfrom collections import defaultdict\nfrom pathlib import Path\n\ndef summarize_sales(filepath: str) -> dict[str, float]:\n    revenue: dict[str, float] = defaultdict(float)\n    with Path(filepath).open() as f:\n        reader = csv.DictReader(f)\n        for row in reader:\n            total = float(row['quantity']) * float(row['price'])\n            revenue[row['product']] += total\n    return dict(sorted(revenue.items(), key=lambda x: x[1], reverse=True))\n\nif __name__ == '__main__':\n    results = summarize_sales('sales.csv')\n    print(f\"{'Product':<30} {'Revenue':>12}\")\n    print('-' * 44)\n    grand = 0.0\n    for product, total in results.items():\n        print(f\"{product:<30} ${total:>11,.2f}\")\n        grand += total\n    print('-' * 44)\n    print(f\"{'TOTAL':<30} ${grand:>11,.2f}\")\n```\n\n`csv.DictReader` reads by header name so column order doesn't matter. The `defaultdict(float)` starts every product at 0, avoiding an explicit existence check. Type annotation `dict[str, float]` requires Python 3.9+." }],
      model: "claude-sonnet-4-6", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 60, output_tokens: 248 },
    },
    timestamp: daysAgo(2), durationMs: 754,
  });

  // M-3. Tool use — weather — sonnet, warn latency, 1d ago
  const m3 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "What's the current weather in Warsaw and Krakow? I need to decide which city to visit this weekend." }],
      max_tokens: 1024,
      tools: [{
        name: "get_weather",
        description: "Get current weather for a location",
        input_schema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City name" },
            units: { type: "string", enum: ["celsius", "fahrenheit"] },
          },
          required: ["location"],
        },
      }],
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [
        { type: "tool_use", id: `toolu_${uid()}`, name: "get_weather", input: { location: "Warsaw, Poland", units: "celsius" } },
        { type: "tool_use", id: `toolu_${uid()}`, name: "get_weather", input: { location: "Krakow, Poland", units: "celsius" } },
      ],
      model: "claude-sonnet-4-6", stop_reason: "tool_use", stop_sequence: null,
      usage: { input_tokens: 108, output_tokens: 82 },
    },
    timestamp: hoursAgo(8), durationMs: 1640,
  });
  starred.push(m3);
  noted.push([m3, "Tool use: two parallel get_weather calls issued in a single response."]);

  // M-4. Multi-turn code review (Python SQL injection) — sonnet, 3d ago
  const m4 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "Review this Python function:\n\ndef get_user(id):\n    conn = db.connect()\n    result = conn.execute(f'SELECT * FROM users WHERE id = {id}')\n    return result.fetchone()" },
        { role: "assistant", content: "Two critical issues:\n\n1. **SQL injection** — interpolating `id` directly. An attacker can pass `1 OR 1=1` to read all rows.\n2. **Connection leak** — `conn` is never closed, exhausting your pool under load.\n\nFix:\n```python\ndef get_user(user_id: int):\n    with db.connect() as conn:\n        return conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()\n```" },
        { role: "user", content: "Good. How should I handle the case where the user doesn't exist?" },
      ],
      max_tokens: 1024,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "Return `None` and let the caller decide — don't raise for expected absence:\n\n```python\ndef get_user(user_id: int) -> dict | None:\n    with db.connect() as conn:\n        row = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()\n        return dict(row) if row else None\n\n# Caller handles None explicitly\nuser = get_user(42)\nif user is None:\n    return 404, {'error': 'User not found'}\n```\n\nThis keeps the function pure — one job, no HTTP concerns mixed in. It also makes unit tests trivial: just test that `None` is returned when the row is absent." }],
      model: "claude-sonnet-4-6", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 198, output_tokens: 168 },
    },
    timestamp: daysAgo(3), durationMs: 1180,
  });
  starred.push(m4);
  noted.push([m4, "Good multi-turn code review — SQL injection + resource leak + None handling in one flow."]);

  // M-5. Vitest unit tests — haiku with system, 11d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      system: "You write concise, well-structured unit tests. Use Vitest syntax. No preamble.",
      messages: [{ role: "user", content: "Write unit tests for `formatCurrency(amount: number, currency: string): string` that formats like `formatCurrency(1234.5, 'USD') → '$1,234.50'`. Cover edge cases." }],
      max_tokens: 512,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "```typescript\nimport { describe, it, expect } from 'vitest';\nimport { formatCurrency } from './formatCurrency';\n\ndescribe('formatCurrency', () => {\n  it('formats USD with comma separators and 2 decimals', () => {\n    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');\n  });\n  it('formats EUR with correct symbol', () => {\n    expect(formatCurrency(999, 'EUR')).toBe('€999.00');\n  });\n  it('handles zero', () => {\n    expect(formatCurrency(0, 'USD')).toBe('$0.00');\n  });\n  it('handles large numbers', () => {\n    expect(formatCurrency(1_000_000, 'USD')).toBe('$1,000,000.00');\n  });\n  it('rounds to 2 decimal places', () => {\n    expect(formatCurrency(1.005, 'USD')).toBe('$1.01');\n  });\n  it('handles negative amounts', () => {\n    expect(formatCurrency(-42.5, 'USD')).toBe('-$42.50');\n  });\n});\n```" }],
      model: "claude-haiku-4-5", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 72, output_tokens: 208 },
    },
    timestamp: daysAgo(11), durationMs: 498,
  });

  // M-6. React useEffect + AbortController — gpt-4o multi-turn, 4d ago
  const m6 = await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "user", content: "My React useEffect is running twice in development:\n\nuseEffect(() => {\n  fetchUser(userId).then(setUser);\n}, [userId]);\n\nIs this a bug?" },
        { role: "assistant", content: "Not a bug — React 18 Strict Mode intentionally double-invokes effects in development to surface non-idempotent side effects. In production effects run once. Your fetch fires twice but the second result just overwrites the first, which is harmless unless you have a subscription or counter." },
        { role: "user", content: "The double fetch is hitting my rate limits during development. How do I prevent it without removing Strict Mode?" },
      ],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-2024-08-06",
      choices: [{ index: 0, message: { role: "assistant", content: "Add an `AbortController` — the cleanup function cancels the first (dev-only) request before it resolves:\n\n```jsx\nuseEffect(() => {\n  const controller = new AbortController();\n\n  fetchUser(userId, { signal: controller.signal })\n    .then(setUser)\n    .catch(err => {\n      if (err.name !== 'AbortError') throw err;\n    });\n\n  return () => controller.abort();\n}, [userId]);\n```\n\nOn the first (Strict Mode) unmount, `controller.abort()` cancels the in-flight request. The second mount starts fresh. In production the cleanup never fires early, so you get exactly one fetch.\n\nThis also correctly handles `userId` changes mid-fetch — the stale request is cancelled before the new one starts." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 168, completion_tokens: 174, total_tokens: 342 },
    },
    timestamp: daysAgo(4), durationMs: 1320,
  });
  starred.push(m6);
  noted.push([m6, "AbortController pattern — great teaching example for React strict mode + cleanup."]);

  // M-7. SQL index optimization — gpt-4o, 5d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "This query is slow on a 10M-row table:\n\nSELECT * FROM orders WHERE status = 'pending' AND created_at > '2024-01-01'\n\nWhat indexes should I add and why?" }],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-2024-08-06",
      choices: [{ index: 0, message: { role: "assistant", content: "Add a composite index on `(status, created_at)`:\n\n```sql\nCREATE INDEX idx_orders_status_created\nON orders (status, created_at DESC);\n```\n\n**Why this order?** Equality predicate first (`status`) — the index jumps directly to 'pending' rows, then uses `created_at` for the range scan. Reversing them forces a full range scan on `created_at` first.\n\n**Drop `SELECT *`** — it forces a table heap fetch for every matched row. Specify only needed columns, or use a covering index:\n\n```sql\nCREATE INDEX idx_orders_covering\nON orders (status, created_at DESC)\nINCLUDE (id, customer_id, total_amount);\n```\n\nRun `EXPLAIN ANALYZE` before and after to confirm." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 74, completion_tokens: 192, total_tokens: 266 },
    },
    timestamp: daysAgo(5), durationMs: 842,
  });

  // M-8. Docker multi-stage — gpt-4o, 13d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "Write a production-ready Dockerfile for a Node.js 22 API: multi-stage build, non-root user, minimal image size, health check." }],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-2024-08-06",
      choices: [{ index: 0, message: { role: "assistant", content: "```dockerfile\n# Stage 1: build\nFROM node:22-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --ignore-scripts\nCOPY . .\nRUN npm run build\n\n# Stage 2: production\nFROM node:22-alpine AS runner\nWORKDIR /app\n\nRUN addgroup -S appgroup && adduser -S appuser -G appgroup\n\nCOPY package*.json ./\nRUN npm ci --omit=dev --ignore-scripts && npm cache clean --force\n\nCOPY --from=builder /app/dist ./dist\n\nHEALTHCHECK --interval=30s --timeout=3s \\\n  CMD wget -qO- http://localhost:3000/health || exit 1\n\nUSER appuser\nEXPOSE 3000\nENTRYPOINT [\"node\", \"dist/index.js\"]\n```\n\n`alpine` base keeps the image ~55 MB vs ~1 GB. `--omit=dev` in the production stage strips devDependencies. `--ignore-scripts` prevents postinstall footguns. HEALTHCHECK lets orchestrators (ECS, Kubernetes) detect unhealthy containers." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 40, completion_tokens: 228, total_tokens: 268 },
    },
    timestamp: daysAgo(13), durationMs: 714,
  });

  // ══ L — large, complex, multi-turn ═══════════════════════════════════════════

  // L-1. SaaS business analysis — opus, 7d ago
  const l1 = await seedAnthropic(token, {
    request: {
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "Analyze the following SaaS business model and identify the top 3 risks with concrete mitigation steps:\n\nContext:\n- Product: B2B analytics platform for mid-market (50–500 employees)\n- Pricing: $299/seat/month\n- GTM: outbound sales + PLG (competing motions)\n- ARR: $180k, 8 customers, ACV $22.5k\n- Team: 6 engineers, 1 sales rep, 1 CS manager\n- Burn: $120k/month, 18 months runway\n- NPS: 42 (based on 6 responses)\n- Churn: 0% so far, but cohort is < 9 months old\n\nBe specific about what to do, not just what the risks are." }],
      max_tokens: 2048,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "Looking at this model, three risks dominate — in order of urgency:\n\n**1. Revenue concentration risk (Critical — act now)**\n8 customers at $22.5k ACV means your top 2 customers likely represent 35–40% of ARR. One churn event before month 9 could be existential.\n\n*Mitigations:*\n- Set a hard target: 15 customers before your next funding conversation. Not for vanity — to make concentration survivable.\n- Identify your 2 best-fit customers and build an ICP document from their firmographic and behavioral traits. Your next 7 outbound targets should match on at least 4 of 5 attributes.\n- Add a quarterly business review cadence with your top 3 accounts. You've had 0% churn but 0 data — QBRs give you leading signals (usage drop, stakeholder change, budget cycle) before a cancel request.\n\n**2. GTM motion conflict (High — decide within 90 days)**\nOutbound sales and PLG are philosophically opposed and resource-competing. Outbound needs a consultative sales rep doing discovery calls; PLG needs a frictionless activation path that engineers build. With 1 sales rep and 6 engineers, you're under-resourced for either.\n\n*Mitigations:*\n- Look at how your 8 customers actually got there. If 6+ came from outbound, kill PLG investments for now and hire a second rep with your next funding. If 3+ came through self-serve, flip the ratio.\n- Set a 90-day experiment: freeze engineering PLG work, double outbound output. Measure pipeline velocity vs. engineering output per dollar spent. Pick the motion with better unit economics.\n- If you keep both, create a hard boundary: PLG for companies < 50 seats, outbound for 50+. Different pricing, different sales motion, different CSM SLA.\n\n**3. Pricing ceiling at $299/seat (Medium — redesign before Series A)**\nMid-market procurement will push back when you expand to 20+ seats ($6k+/month). Per-seat pricing creates a misaligned incentive: customers limit seats to control cost, which limits your usage data and reduces stickiness.\n\n*Mitigations:*\n- Move to a hybrid: platform fee ($X/month) + usage tier (events or API calls processed). This removes the expansion ceiling and aligns your revenue with the value customers get.\n- Before redesigning, run 3 pricing conversations with existing customers: 'If we moved to platform + usage, what would feel fair?' Their answers will calibrate your tiers.\n- Time this change: implement before your next 3 enterprise deals, not during renewal cycles with existing customers.\n\n**Immediate priority list:**\n1. Book QBRs with top 3 accounts this week.\n2. Interview 2 churned prospects to understand why they didn't buy.\n3. Decide GTM motion — give yourself a 90-day deadline with a forcing function (e.g., 'if we don't hit $250k ARR by [date] from outbound alone, we pivot to PLG')." }],
      model: "claude-opus-4-8", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 204, output_tokens: 618 },
    },
    timestamp: daysAgo(7), durationMs: 4820,
  });
  noted.push([l1, "High latency for Opus with long output — expected. Good for latency breakdown demos."]);

  // L-2. Microservices architecture multi-turn — opus, 10d ago
  const l2 = await seedAnthropic(token, {
    request: {
      model: "claude-opus-4-8",
      messages: [
        { role: "user", content: "We're migrating from a monolith to microservices. Should we use event-driven architecture or REST between services?" },
        { role: "assistant", content: "Neither exclusively — use both where they fit:\n\n**REST** for synchronous, user-facing operations where latency and immediate consistency matter. Direct call, direct response, easy to trace.\n\n**Events** for broadcasting state changes where multiple services need to react and eventual consistency is acceptable.\n\nThe anti-pattern: making everything event-driven because it feels modern. You end up debugging a user request across 8 async hops with no stack trace." },
        { role: "user", content: "We have orders and inventory that need to stay in sync. How do we handle consistency across those two services?" },
        { role: "assistant", content: "Use the Saga pattern. Two variants:\n\n**Choreography** (simpler): Order Service emits `OrderPlaced` → Inventory Service reserves stock and emits `StockReserved` → Order Service confirms. On failure, each service emits a compensating event.\n\n**Orchestration** (better for complex flows): A dedicated Saga Orchestrator coordinates the sequence and handles rollbacks explicitly.\n\nFor your case, start with choreography. Add the **outbox pattern** to guarantee delivery: write the event to your DB in the same transaction as the state change. A background poller then publishes it. This prevents the 'DB committed, Kafka failed' split-brain." },
        { role: "user", content: "What does the outbox pattern actually look like in code? Give me a concrete Postgres + Node.js example." },
      ],
      max_tokens: 1536,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "Here's a working outbox pattern for Postgres + Node.js:\n\n**1. Schema**\n```sql\nCREATE TABLE outbox_events (\n  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  aggregate_type TEXT NOT NULL,   -- 'order', 'inventory'\n  aggregate_id   TEXT NOT NULL,\n  event_type     TEXT NOT NULL,   -- 'OrderPlaced', 'StockReserved'\n  payload        JSONB NOT NULL,\n  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n  published_at   TIMESTAMPTZ          -- NULL = not yet published\n);\n\nCREATE INDEX idx_outbox_unpublished ON outbox_events (created_at)\n  WHERE published_at IS NULL;\n```\n\n**2. Write event in the same transaction as the state change**\n```typescript\nasync function placeOrder(pool: Pool, order: NewOrder): Promise<string> {\n  const client = await pool.connect();\n  try {\n    await client.query('BEGIN');\n\n    // 1. Write the order\n    const { rows: [{ id }] } = await client.query(\n      `INSERT INTO orders (customer_id, total) VALUES ($1, $2) RETURNING id`,\n      [order.customerId, order.total],\n    );\n\n    // 2. Write the event in the same transaction\n    await client.query(\n      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)\n       VALUES ('order', $1, 'OrderPlaced', $2)`,\n      [id, JSON.stringify({ orderId: id, items: order.items, customerId: order.customerId })],\n    );\n\n    await client.query('COMMIT');\n    return id;\n  } catch (err) {\n    await client.query('ROLLBACK');\n    throw err;\n  } finally {\n    client.release();\n  }\n}\n```\n\n**3. Background relay (runs every 500ms)**\n```typescript\nasync function relayOutboxEvents(pool: Pool, kafka: KafkaProducer) {\n  const client = await pool.connect();\n  try {\n    // Lock rows so concurrent relay instances don't double-publish\n    const { rows } = await client.query(`\n      SELECT * FROM outbox_events\n      WHERE published_at IS NULL\n      ORDER BY created_at\n      LIMIT 100\n      FOR UPDATE SKIP LOCKED\n    `);\n\n    for (const event of rows) {\n      await kafka.send({\n        topic: event.event_type,\n        messages: [{ key: event.aggregate_id, value: JSON.stringify(event.payload) }],\n      });\n      await client.query(\n        `UPDATE outbox_events SET published_at = NOW() WHERE id = $1`,\n        [event.id],\n      );\n    }\n  } finally {\n    client.release();\n  }\n}\n\n// Start relay\nsetInterval(() => relayOutboxEvents(pool, kafka).catch(console.error), 500);\n```\n\nThe critical invariant: `FOR UPDATE SKIP LOCKED` means two relay processes running in parallel will never publish the same event twice. The ~500ms lag is acceptable for inventory sync; if you need lower latency, use Postgres `LISTEN/NOTIFY` to trigger the relay immediately after each commit." }],
      model: "claude-opus-4-8", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 422, output_tokens: 784 },
    },
    timestamp: daysAgo(10), durationMs: 6240,
  });
  starred.push(l2);
  noted.push([l2, "Deep microservices thread — outbox pattern with working Postgres + Node.js code."]);

  // L-3. pandas data analysis — gpt-4o multi-turn, 3d ago
  const l3 = await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "user", content: "Write a Python script using pandas to analyze user events. Find the top 5 most active users by event count in the last 7 days, including their average session duration." },
        { role: "assistant", content: "```python\nimport pandas as pd\nfrom datetime import datetime, timedelta\n\ndef analyze_active_users(df: pd.DataFrame) -> pd.DataFrame:\n    cutoff = datetime.now() - timedelta(days=7)\n    recent = df[df['timestamp'] >= cutoff]\n    return (\n        recent.groupby('user_id')\n        .agg(event_count=('event_type', 'count'), avg_session_duration=('duration_seconds', 'mean'))\n        .sort_values('event_count', ascending=False)\n        .head(5)\n        .round({'avg_session_duration': 1})\n    )\n```\n`agg` computes both metrics in one pass — more efficient than chaining separate groupby operations." },
        { role: "user", content: "Good. Now add: cohort retention — for users who first appeared in the last 30 days, what fraction came back the next day?" },
        { role: "assistant", content: "```python\ndef cohort_day1_retention(df: pd.DataFrame) -> float:\n    df['date'] = pd.to_datetime(df['timestamp']).dt.date\n    first_seen = df.groupby('user_id')['date'].min().reset_index()\n    first_seen.columns = ['user_id', 'first_date']\n\n    cutoff = (datetime.now() - timedelta(days=30)).date()\n    new_users = first_seen[first_seen['first_date'] >= cutoff]\n\n    merged = df.merge(new_users, on='user_id')\n    merged['days_since_first'] = (pd.to_datetime(merged['date']) - pd.to_datetime(merged['first_date'])).dt.days\n\n    returned = merged[merged['days_since_first'] == 1]['user_id'].nunique()\n    return returned / len(new_users) if len(new_users) > 0 else 0.0\n```\nThis counts a user as 'retained' if they have any event exactly 1 day after their first event." },
        { role: "user", content: "Can you combine both into a single report function that returns a dict with 'top_users' and 'day1_retention', and add a simple CLI?" },
      ],
      max_tokens: 1024,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-2024-08-06",
      choices: [{ index: 0, message: { role: "assistant", content: "```python\nimport sys\nimport pandas as pd\nfrom datetime import datetime, timedelta\nfrom typing import TypedDict\n\nclass Report(TypedDict):\n    top_users: pd.DataFrame\n    day1_retention: float\n\ndef generate_report(df: pd.DataFrame) -> Report:\n    df['date'] = pd.to_datetime(df['timestamp']).dt.date\n    now = datetime.now()\n\n    # Top 5 active users — last 7 days\n    recent = df[df['timestamp'] >= now - timedelta(days=7)]\n    top_users = (\n        recent.groupby('user_id')\n        .agg(event_count=('event_type', 'count'), avg_session_s=('duration_seconds', 'mean'))\n        .sort_values('event_count', ascending=False)\n        .head(5)\n        .round({'avg_session_s': 1})\n    )\n\n    # Day-1 retention — cohort from last 30 days\n    first_seen = df.groupby('user_id')['date'].min().rename('first_date')\n    new_users = first_seen[first_seen >= (now - timedelta(days=30)).date()]\n    merged = df[df['user_id'].isin(new_users.index)].merge(new_users, on='user_id')\n    merged['days_since_first'] = (\n        pd.to_datetime(merged['date']) - pd.to_datetime(merged['first_date'])\n    ).dt.days\n    returned = merged[merged['days_since_first'] == 1]['user_id'].nunique()\n    retention = returned / len(new_users) if len(new_users) > 0 else 0.0\n\n    return {'top_users': top_users, 'day1_retention': retention}\n\ndef main():\n    path = sys.argv[1] if len(sys.argv) > 1 else 'events.csv'\n    df = pd.read_csv(path, parse_dates=['timestamp'])\n    report = generate_report(df)\n\n    print(\"\\n=== Top 5 Active Users (last 7 days) ===\")\n    print(report['top_users'].to_string())\n    print(f\"\\n=== Day-1 Retention (last 30-day cohort) ===\")\n    print(f\"{report['day1_retention']:.1%}\")\n\nif __name__ == '__main__':\n    main()\n```\n\nRun with `python report.py events.csv`. The `TypedDict` return type makes downstream usage IDE-friendly without runtime overhead." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 388, completion_tokens: 448, total_tokens: 836 },
    },
    timestamp: daysAgo(3), durationMs: 2840,
  });
  starred.push(l3);

  // L-4. TypeScript fetchWithRetry review — gpt-4o, 9d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "user", content: "Review this TypeScript function:\n\nasync function fetchWithRetry(url: string, retries = 3) {\n  for (let i = 0; i < retries; i++) {\n    try {\n      return await fetch(url);\n    } catch (e) {\n      if (i === retries - 1) throw e;\n    }\n  }\n}" },
        { role: "assistant", content: "Three issues:\n\n1. **No backoff** — retrying immediately hammers a struggling server. Add `await sleep(2 ** i * 100)`.\n2. **Retries non-transient errors** — a 404 won't be fixed by retrying. Check `response.ok` and skip retry for < 500 status.\n3. **Implicit `undefined` return** — TypeScript infers `Promise<Response | undefined>`. Explicit `Promise<Response>` makes the compiler catch the silent undefined." },
        { role: "user", content: "Show me the fixed version with all three issues addressed, plus proper JSDoc." },
      ],
      max_tokens: 768,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-2024-08-06",
      choices: [{ index: 0, message: { role: "assistant", content: "```typescript\n/**\n * Fetch with exponential backoff retry.\n * Only retries on network errors and 5xx responses.\n * @param url - Target URL\n * @param options - Fetch options\n * @param retries - Maximum number of attempts (default: 3)\n * @throws {Error} After all retries are exhausted\n */\nasync function fetchWithRetry(\n  url: string,\n  options: RequestInit = {},\n  retries = 3,\n): Promise<Response> {\n  let lastError: unknown;\n\n  for (let attempt = 0; attempt < retries; attempt++) {\n    try {\n      const response = await fetch(url, options);\n\n      // Don't retry client errors — they won't self-heal\n      if (response.ok || response.status < 500) return response;\n\n      lastError = new Error(`HTTP ${response.status}`);\n    } catch (err) {\n      // Network error (DNS failure, connection refused, etc.)\n      lastError = err;\n    }\n\n    if (attempt < retries - 1) {\n      // Exponential backoff: 100ms, 200ms, 400ms…\n      await new Promise(r => setTimeout(r, 2 ** attempt * 100));\n    }\n  }\n\n  throw lastError ?? new Error('Max retries exceeded');\n}\n\n// Usage\nconst res = await fetchWithRetry('https://api.example.com/data', {\n  headers: { Authorization: `Bearer ${token}` },\n}, 4);\n```\n\nKey change: `lastError` accumulates the failure reason so the final `throw` gives the caller actionable context, not just 'max retries exceeded'." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 248, completion_tokens: 318, total_tokens: 566 },
    },
    timestamp: daysAgo(9), durationMs: 1980,
  });

  // ══ XL — very large, document-scale ══════════════════════════════════════════

  // XL-1. Distributed rate limiting spec — gpt-4o, 6d ago
  const xl1 = await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "Write a comprehensive technical specification for a distributed rate limiting system. Requirements:\n- Handle 500k requests/second across 20 global regions\n- Sub-millisecond enforcement overhead per request\n- Eventual consistency with max 200ms staleness\n- Support multiple rate limit strategies: token bucket, sliding window, fixed window\n- Fail-open behavior during network partitions\n- Per-customer, per-endpoint, and global limits\n- Real-time observability (p99 enforcement latency, limit hit rate, regional counters)\n- Admin API for dynamic limit configuration without restart\n\nInclude: architecture overview, data structures, synchronization protocol, failure modes, deployment topology, and observability design. Be concrete — include pseudocode or data structure definitions where they clarify the design." }],
      max_tokens: 4096,
    },
    response: {
      id: `chatcmpl_${uid()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "gpt-4o-2024-08-06",
      choices: [{ index: 0, message: { role: "assistant", content: "# Distributed Rate Limiting System — Technical Specification\n\n## 1. Architecture Overview\n\nThree-tier design: local enforcement (< 1ms), regional aggregation (~10ms), global sync (< 200ms).\n\n```\n[Request] → [Sidecar Agent] → [Regional Redis Cluster] ← gossip → [Global Coordinator]\n                ↕ atomic CAS                                              ↕ config push\n           [Local Memory]                                          [Admin API]\n```\n\nEach region has a sidecar agent co-located with API gateway replicas. The sidecar enforces locally using atomic in-memory counters and syncs with the regional Redis cluster every 50ms. Regional clusters gossip to each other every 100ms via a CRDT-based counter merge.\n\n## 2. Data Structures\n\n### Rate Limit Key\n```typescript\ninterface RateLimitKey {\n  customerId: string;\n  endpoint: string;     // e.g. 'POST /v1/chat'\n  region: string;       // e.g. 'us-east-1'\n  windowStart: number;  // unix seconds, truncated to window boundary\n}\n\n// Serialized: 'cust_{id}:ep_{hash}:reg_{region}:w_{windowStart}'\n```\n\n### Counter (CRDT G-Counter per region)\n```typescript\ninterface RegionalCounter {\n  key: RateLimitKey;\n  localCount: bigint;                     // only this region increments this\n  peerCounts: Record<string, bigint>;     // last known count from each peer region\n  limit: number;\n  strategy: 'token_bucket' | 'sliding_window' | 'fixed_window';\n  updatedAt: number;\n}\n\n// Global view: sum of localCount + all peerCounts\nfunction globalCount(c: RegionalCounter): bigint {\n  return c.localCount + Object.values(c.peerCounts).reduce((s, v) => s + v, 0n);\n}\n```\n\n### Token Bucket State\n```typescript\ninterface TokenBucket {\n  tokens: number;      // current available tokens (float, allows fractional)\n  lastRefill: number;  // unix ms\n  ratePerSec: number;\n  capacity: number;\n}\n\nfunction consume(bucket: TokenBucket, cost: number, now: number): boolean {\n  const elapsed = (now - bucket.lastRefill) / 1000;\n  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.ratePerSec);\n  bucket.lastRefill = now;\n  if (bucket.tokens >= cost) { bucket.tokens -= cost; return true; }\n  return false;\n}\n```\n\n## 3. Local Enforcement (< 1ms path)\n\n```typescript\nclass LocalEnforcer {\n  // Sharded by key hash to reduce lock contention\n  private shards: Array<Map<string, TokenBucket | SlidingWindow>> = \n    Array.from({ length: 256 }, () => new Map());\n\n  check(key: string, cost = 1): 'allow' | 'deny' {\n    const shard = this.shards[hashKey(key) & 0xFF]!;\n    const state = shard.get(key) ?? this.createState(key);\n    // Atomic CAS via single-threaded Node.js event loop — no locks needed\n    return applyStrategy(state, cost, Date.now()) ? 'allow' : 'deny';\n  }\n}\n```\n\nSingle-threaded Node.js eliminates lock contention. 256 shards keep Map lookup O(1) with good cache locality. Target: < 50µs per enforcement check.\n\n## 4. Regional Sync (50ms cycle)\n\n```typescript\nasync function syncWithRegionalRedis(enforcer: LocalEnforcer, redis: Redis) {\n  const dirty = enforcer.drainDirtyKeys();  // keys modified since last sync\n  \n  const pipe = redis.pipeline();\n  for (const key of dirty) {\n    const delta = enforcer.getDelta(key);   // increments since last sync\n    pipe.incrby(`counter:${key}`, delta);\n    pipe.expire(`counter:${key}`, 120);     // TTL = 2 × window\n  }\n  await pipe.exec();\n\n  // Pull peer region counts for active keys\n  const peerKeys = dirty.map(k => `peer:*:${k}`);\n  const peerCounts = await redis.mget(...peerKeys);\n  enforcer.updatePeerCounts(peerKeys, peerCounts);\n}\n```\n\n## 5. Global Gossip Protocol (100ms cycle)\n\nRegions broadcast their per-key delta vectors using a gossip ring (each region pushes to 2 neighbors). Full convergence in O(log R) rounds where R = number of regions = 20 → 5 rounds = 500ms worst case. Acceptable given 200ms staleness SLA with 2 gossip rounds (200ms).\n\n```typescript\ninterface GossipMessage {\n  fromRegion: string;\n  seq: number;          // monotonically increasing per region\n  deltas: Array<{ key: string; count: bigint; windowStart: number }>;\n}\n```\n\nDuplicate suppression via `seq` numbers — a region discards gossip with seq ≤ last seen seq from that peer.\n\n## 6. Failure Modes\n\n| Failure | Detection | Behavior |\n|---------|-----------|----------|\n| Regional Redis down | health check + 3 failed syncs | Fall back to local-only enforcement; accept ±15% burst over limit |\n| Gossip peer unreachable | missed acks × 3 | Widen staleness window; alert if > 500ms |\n| Counter overflow (unlikely at 64-bit) | threshold check at 90% max | Reset window early with distributed 2PC |\n| Admin API unreachable | N/A | Serve last known config; log stale config warning |\n\n**Fail-open policy:** if the sidecar itself crashes or hangs (> 5ms on enforcement path), the request is allowed and the event is logged to a dead-letter queue for retroactive billing adjustment.\n\n## 7. Admin API\n\n```http\n# Update limit for a customer+endpoint, effective within 2 gossip rounds (~200ms)\nPATCH /admin/limits\n{ \"customerId\": \"cust_123\", \"endpoint\": \"POST /v1/chat\", \"rps\": 100, \"burst\": 150 }\n\n# Read current counters (regional breakdown)\nGET /admin/limits/cust_123/counters\n→ { \"us-east-1\": 42, \"eu-west-1\": 18, \"ap-southeast-1\": 5, \"global\": 65 }\n\n# Immediate block (propagates in < 50ms via Redis pub/sub)\nPOST /admin/limits/cust_123/block\n```\n\nConfig changes are written to a central config store (DynamoDB) and pushed via Redis pub/sub to all regional coordinators. Sidecars poll their regional coordinator every 10s as a fallback.\n\n## 8. Observability\n\n```typescript\n// Emitted per enforcement decision\ninterface EnforcementEvent {\n  key: string;\n  decision: 'allow' | 'deny';\n  localCount: number;\n  globalEstimate: number;\n  limit: number;\n  enforcementLatencyUs: number;  // microseconds\n  staleness: number;              // ms since last regional sync\n}\n```\n\nMetrics pipeline: sidecar → local StatsD (UDP, non-blocking) → regional Prometheus → Grafana global view. P99 enforcement latency alert threshold: 500µs. Limit hit rate alert: > 5% of requests denied for a single customer in a 1-minute window (possible misconfiguration)." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 168, completion_tokens: 1482, total_tokens: 1650 },
    },
    timestamp: daysAgo(6), durationMs: 9840,
  });
  noted.push([xl1, "Very large output (1482 tokens, 9.8s) — good for latency + cost analysis in dashboard."]);

  // XL-2. Full code generation: auth middleware suite — sonnet, long system prompt, 1d ago
  const xl2 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      system: "You are a senior backend engineer specializing in Node.js and TypeScript security patterns. You write production-grade code with full type coverage, comprehensive error handling, and inline documentation only where non-obvious. When generating code, include: the implementation, a test suite using Vitest, and a usage example. Follow these constraints: no external auth libraries (no passport, no auth0 SDK), use standard Node.js crypto module, all tokens are opaque random bytes encoded as base64url.",
      messages: [{
        role: "user",
        content: "Build a complete JWT-free authentication middleware for a Fastify API. Requirements:\n\n1. Session tokens: 32 random bytes, base64url-encoded, stored in an httpOnly SameSite=Strict cookie\n2. Token storage: in-memory Map with TTL-based expiry (no Redis dependency for now)\n3. Middleware: validates cookie, looks up session, rejects expired/missing sessions with 401\n4. createSession(userId): creates and stores a session, returns the token\n5. destroySession(token): removes the session\n6. Session data: { userId, createdAt, expiresAt, lastSeenAt } — update lastSeenAt on each valid request\n7. Session TTL: 24h from creation, sliding 1h window on lastSeenAt (whichever is later)\n8. Include a cleanup interval that evicts expired sessions every 5 minutes\n9. The middleware should attach `request.session` with the session data\n\nGenerate the full implementation, Vitest tests, and a Fastify plugin wrapper."
      }],
      max_tokens: 4096,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "```typescript\n// session-store.ts\nimport { randomBytes } from 'node:crypto';\n\nexport interface SessionData {\n  userId: string;\n  createdAt: Date;\n  expiresAt: Date;\n  lastSeenAt: Date;\n}\n\nconst TTL_MS = 24 * 60 * 60 * 1000;     // 24h hard limit\nconst SLIDE_MS = 60 * 60 * 1000;         // 1h sliding window\n\nexport class SessionStore {\n  private sessions = new Map<string, SessionData>();\n  private cleanupTimer: NodeJS.Timeout;\n\n  constructor(cleanupIntervalMs = 5 * 60 * 1000) {\n    this.cleanupTimer = setInterval(() => this.evictExpired(), cleanupIntervalMs);\n    this.cleanupTimer.unref(); // don't keep process alive\n  }\n\n  createSession(userId: string): string {\n    const token = randomBytes(32).toString('base64url');\n    const now = new Date();\n    this.sessions.set(token, {\n      userId,\n      createdAt: now,\n      expiresAt: new Date(now.getTime() + TTL_MS),\n      lastSeenAt: now,\n    });\n    return token;\n  }\n\n  getSession(token: string): SessionData | null {\n    const session = this.sessions.get(token);\n    if (!session) return null;\n    const now = new Date();\n    // Expired: past hard TTL or past sliding window\n    if (now > session.expiresAt || now.getTime() - session.lastSeenAt.getTime() > SLIDE_MS) {\n      this.sessions.delete(token);\n      return null;\n    }\n    session.lastSeenAt = now;\n    return session;\n  }\n\n  destroySession(token: string): boolean {\n    return this.sessions.delete(token);\n  }\n\n  private evictExpired() {\n    const now = new Date();\n    for (const [token, session] of this.sessions) {\n      if (now > session.expiresAt || now.getTime() - session.lastSeenAt.getTime() > SLIDE_MS) {\n        this.sessions.delete(token);\n      }\n    }\n  }\n\n  destroy() {\n    clearInterval(this.cleanupTimer);\n    this.sessions.clear();\n  }\n\n  get size() { return this.sessions.size; }\n}\n```\n\n```typescript\n// session-plugin.ts\nimport type { FastifyPluginAsync, FastifyRequest } from 'fastify';\nimport fp from 'fastify-plugin';\nimport { SessionStore, type SessionData } from './session-store.js';\n\ndeclare module 'fastify' {\n  interface FastifyRequest {\n    session: SessionData | null;\n  }\n  interface FastifyInstance {\n    sessionStore: SessionStore;\n  }\n}\n\nconst COOKIE_NAME = 'sid';\n\nconst sessionPlugin: FastifyPluginAsync = async (fastify) => {\n  const store = new SessionStore();\n  fastify.decorate('sessionStore', store);\n  fastify.decorateRequest('session', null);\n\n  fastify.addHook('onClose', () => store.destroy());\n\n  fastify.addHook('preHandler', async (request: FastifyRequest, reply) => {\n    const token = request.cookies[COOKIE_NAME];\n    if (!token) { request.session = null; return; }\n    const session = store.getSession(token);\n    if (!session) {\n      reply.clearCookie(COOKIE_NAME);\n      request.session = null;\n    } else {\n      request.session = session;\n    }\n  });\n};\n\nexport default fp(sessionPlugin, { name: 'session' });\n\n// Helper to set the session cookie after login\nexport function setSessionCookie(reply: FastifyReply, token: string) {\n  reply.setCookie(COOKIE_NAME, token, {\n    httpOnly: true,\n    sameSite: 'strict',\n    path: '/',\n    maxAge: 24 * 60 * 60, // seconds\n  });\n}\n```\n\n```typescript\n// session-store.test.ts\nimport { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';\nimport { SessionStore } from './session-store.js';\n\ndescribe('SessionStore', () => {\n  let store: SessionStore;\n\n  beforeEach(() => { store = new SessionStore(Infinity); }); // disable auto-cleanup\n  afterEach(() => store.destroy());\n\n  it('creates a session and retrieves it', () => {\n    const token = store.createSession('user_1');\n    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url\n    const session = store.getSession(token);\n    expect(session?.userId).toBe('user_1');\n  });\n\n  it('updates lastSeenAt on each access', () => {\n    const token = store.createSession('user_1');\n    const first = store.getSession(token)!.lastSeenAt;\n    vi.advanceTimersByTime(1000);\n    const second = store.getSession(token)!.lastSeenAt;\n    expect(second.getTime()).toBeGreaterThan(first.getTime());\n  });\n\n  it('returns null for unknown tokens', () => {\n    expect(store.getSession('bogus')).toBeNull();\n  });\n\n  it('destroys a session', () => {\n    const token = store.createSession('user_1');\n    store.destroySession(token);\n    expect(store.getSession(token)).toBeNull();\n  });\n\n  it('expires session past 24h TTL', () => {\n    vi.useFakeTimers();\n    const token = store.createSession('user_1');\n    vi.advanceTimersByTime(25 * 60 * 60 * 1000);\n    expect(store.getSession(token)).toBeNull();\n    vi.useRealTimers();\n  });\n\n  it('expires session idle for more than 1h', () => {\n    vi.useFakeTimers();\n    const token = store.createSession('user_1');\n    vi.advanceTimersByTime(61 * 60 * 1000);\n    expect(store.getSession(token)).toBeNull();\n    vi.useRealTimers();\n  });\n\n  it('evictExpired removes stale sessions', () => {\n    vi.useFakeTimers();\n    store.createSession('user_1');\n    store.createSession('user_2');\n    vi.advanceTimersByTime(25 * 60 * 60 * 1000);\n    (store as unknown as { evictExpired(): void }).evictExpired();\n    expect(store.size).toBe(0);\n    vi.useRealTimers();\n  });\n});\n```\n\n```typescript\n// Usage in a Fastify app\nimport Fastify from 'fastify';\nimport cookie from '@fastify/cookie';\nimport sessionPlugin, { setSessionCookie } from './session-plugin.js';\n\nconst app = Fastify();\nawait app.register(cookie);\nawait app.register(sessionPlugin);\n\napp.post('/login', async (request, reply) => {\n  const { email, password } = request.body as { email: string; password: string };\n  const user = await verifyCredentials(email, password); // your logic\n  if (!user) return reply.status(401).send({ error: 'Invalid credentials' });\n  const token = app.sessionStore.createSession(user.id);\n  setSessionCookie(reply, token);\n  return { ok: true };\n});\n\napp.post('/logout', async (request, reply) => {\n  const token = request.cookies['sid'];\n  if (token) app.sessionStore.destroySession(token);\n  reply.clearCookie('sid');\n  return { ok: true };\n});\n\napp.get('/me', async (request, reply) => {\n  if (!request.session) return reply.status(401).send({ error: 'Unauthorized' });\n  return { userId: request.session.userId, lastSeenAt: request.session.lastSeenAt };\n});\n```" }],
      model: "claude-sonnet-4-6", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 612, output_tokens: 1688 },
    },
    timestamp: hoursAgo(22), durationMs: 7120,
  });
  starred.push(xl2);
  noted.push([xl2, "XL trace — long system prompt + complex code generation + tests. High input + output tokens."]);

  // XL-3. RAG document analysis — opus, 12d ago
  const xl3 = await seedAnthropic(token, {
    request: {
      model: "claude-opus-4-8",
      system: "You are a technical due diligence analyst. You analyze software architecture documents, engineering blog posts, and technical specs provided by acquisition targets. Your job is to identify technical risks, assess engineering quality, and provide an honest risk rating. Format: Risk level (Low/Medium/High/Critical), Executive summary (3 sentences), Detailed findings (bullet points per category), Red flags (if any), Recommended follow-up questions.",
      messages: [{
        role: "user",
        content: "Analyze the following technical architecture document from a Series B SaaS company we're evaluating for acquisition at $45M:\n\n---\nARCHITECTURE OVERVIEW — DataStream Analytics Platform\n\nBackend: Python 3.8 monolith (Django 2.2 LTS), 180k lines of code, single PostgreSQL 11 instance (no read replicas), deployed on a single EC2 r5.4xlarge. No CDN. Redis for session storage only.\n\nFrontend: jQuery 2.x + Bootstrap 3, server-side rendering via Django templates. No TypeScript. No component framework.\n\nInfrastructure: Manual EC2 deployments via SSH and a bash script. No IaC. No CI/CD pipeline — developers push directly to main and SSH to deploy. Single availability zone (us-east-1a). No auto-scaling. RDS automated backups enabled, last restore test: never.\n\nData: 2.1TB PostgreSQL database, 340M rows in the events table with no partitioning. Largest table has 12 indexes. p99 query latency: 8.2 seconds (per their own Datadog). Reported uptime: 99.1% over the last 12 months.\n\nSecurity: MD5 password hashing (from a 2019 migration that was 'never finished'). No WAF. Dependencies last audited: 'when we hired the first engineer' (2021). 14 known CVEs in npm lockfile, status unknown for Python packages. SOC 2 Type II: not started, 'planning to begin Q3'.\n\nTeam: 3 engineers (2 backend, 1 frontend/DevOps). Founders are both technical. 0 dedicated QA. Test coverage: ~18% (estimate, not measured). No on-call rotation — engineers are notified by customers.\n\nCustomer data: 47 enterprise customers, data residency requirements for 6 EU customers (GDPR), no data processing agreements in place with EU customers.\n---\n\nProvide your full technical due diligence assessment."
      }],
      max_tokens: 3000,
    },
    response: {
      id: `msg_${uid()}`, type: "message", role: "assistant",
      content: [{ type: "text", text: "## Technical Due Diligence Assessment — DataStream Analytics\n\n**Risk Level: CRITICAL**\n\n**Executive Summary:** DataStream presents a cluster of critical technical and legal risks that would require immediate and substantial remediation investment post-acquisition. The combination of MD5 password storage, absent GDPR compliance infrastructure, and a single-point-of-failure architecture creates both regulatory exposure and operational fragility that significantly affects the $45M valuation. We estimate $2–4M in remediation engineering costs and 12–18 months to reach defensible enterprise standards, plus potential regulatory liability that is currently unquantifiable.\n\n---\n\n### Security Findings\n\n**Critical:**\n- **MD5 password hashing**: MD5 is cryptographically broken for password storage since ~2004. Any database breach exposes all customer passwords in hours via rainbow tables. This is not a compliance gap — it's an active breach risk. Remediation requires a forced password reset for all ~47 enterprise accounts' end users, with reputational and contractual implications.\n- **14 known CVEs in npm lockfile, Python packages unaudited**: Unknown blast radius. Requires immediate dependency audit. If any CVE is exploitable in their stack, breach notification obligations may already exist.\n- **No WAF**: 47 enterprise customers with no layer-7 protection. Public-facing Django 2.2 has known security patches that were discontinued in April 2022.\n\n**High:**\n- Django 2.2 reached EOL April 2022. No security patches for 2+ years.\n- No penetration test history found in data room.\n- Session tokens in Redis with no token rotation policy.\n\n### Data & Compliance Findings\n\n**Critical:**\n- **GDPR breach already in progress**: 6 EU customers with no Data Processing Agreements in place. Under GDPR Article 28, processing EU personal data without a DPA is a violation — not a gap to close, an active violation. Fines: up to 4% of global annual turnover or €20M, whichever is higher.\n- **No data residency enforcement**: EU customer data is stored in us-east-1a with no documented controls. Depending on customer contracts, this may be a breach of contract in addition to regulatory exposure.\n- **Backup restore never tested**: 2.1TB database, automated backups enabled, but zero restore validation. This is not a compliance issue — it's a disaster recovery fiction. Assume RTO/RPO is unknown.\n\n**High:**\n- 340M-row unpartitioned events table with p99 of 8.2 seconds is architecturally unsustainable. Growth of 20% in data volume will likely cause p99 to exceed 30 seconds without partitioning and query optimization.\n- 12 indexes on the largest table suggests query-by-query index addition without an index strategy, which increases write amplification.\n\n### Infrastructure & Operations\n\n**High:**\n- Single AZ deployment with no auto-scaling: one hardware failure = full outage. Their 99.1% uptime = ~79 hours downtime/year, consistent with this architecture.\n- Manual SSH deployments with no CI/CD: no deployment audit trail, no rollback capability, developer access to production is a SOC 2 showstopper.\n- No IaC: infrastructure is undocumented by definition. Reconstruction time after a failure is unknown.\n\n**Medium:**\n- 3-engineer team with 0 QA and no on-call rotation is unsustainable at 47 enterprise customers. Key-person risk is extreme — losing one backend engineer halves the team's capacity.\n- 18% test coverage (unverified) means refactoring the monolith during remediation carries high regression risk.\n\n### Engineering Quality\n\n**Medium:**\n- Django monolith at 180k lines is not inherently problematic, but combined with 18% coverage and no CI/CD, it's very difficult to safely evolve.\n- jQuery 2.x + Bootstrap 3 frontend is 10 years behind current practice. For a data analytics product, this likely limits the UI capabilities that enterprise customers will expect.\n- Python 3.8 reaches EOL October 2024.\n\n---\n\n### Red Flags\n\n1. **'GDPR planning hasn't started'** at $45M ARR with 6 EU enterprise customers is a legal department conversation, not an engineering one.\n2. **'Last restore test: never'** is not a gap — it's the absence of disaster recovery.\n3. **'Dependencies last audited when we hired the first engineer (2021)'** combined with 14 known CVEs suggests security has never been a priority, not that it was deprioritized under growth pressure.\n4. **MD5 migration 'never finished'** since 2019 (5 years) suggests the team is aware of the issue and chose not to fix it. This is a culture signal.\n\n---\n\n### Recommended Follow-Up Questions\n\n1. What are the contractual SLA commitments to enterprise customers, and what are the penalty clauses? (Given 99.1% uptime, have penalties been triggered?)\n2. Provide the full CVE list for Python packages — we need to determine if any are exploitable in their deployment.\n3. Has any customer contractually required SOC 2? If so, how is that commitment being met today?\n4. What is the current process for a production incident? Who holds the pager?\n5. Obtain all EU customer contracts and DPA status — we need legal to review before signing any acquisition agreement.\n6. Request a backup restore exercise before close — restore a point-in-time copy of the 2.1TB database to a test environment and verify data integrity.\n\n---\n\n**Acquisition Recommendation:** Do not proceed at $45M without:\n(a) A $2–4M remediation escrow held at close for security and compliance work,\n(b) GDPR legal review and DPA execution with all 6 EU customers prior to signing,\n(c) An independent penetration test with findings disclosed to buyer before close,\n(d) Verified backup restore capability.\n\nIf the seller is unwilling to accommodate these conditions, the risk profile does not support the current valuation." }],
      model: "claude-opus-4-8", stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 988, output_tokens: 1142 },
    },
    timestamp: daysAgo(12), durationMs: 11480,
  });
  starred.push(xl3);
  noted.push([xl3, "XL: 988 input tokens (long doc) + 1142 output. Longest trace by cost — great for dashboard spend chart."]);

  return { starred, noted };
}

// ── background volume traces for dashboard charts ─────────────────────────────

interface BackgroundTrace {
  provider: "anthropic" | "openai";
  model: string;
  daysAgoOffset: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

const BG_MODELS = [
  { provider: "anthropic" as const, model: "claude-haiku-4-5" },
  { provider: "anthropic" as const, model: "claude-haiku-4-5" },
  { provider: "anthropic" as const, model: "claude-sonnet-4-6" },
  { provider: "anthropic" as const, model: "claude-opus-4-8" },
  { provider: "openai" as const, model: "gpt-4o-mini" },
  { provider: "openai" as const, model: "gpt-4o-mini" },
  { provider: "openai" as const, model: "gpt-4o-2024-08-06" },
];

// Size buckets: [inputMin, inputMax, outputMin, outputMax, durMin, durMax, weight]
const SIZE_BUCKETS = [
  [15,  60,   25,  80,   80,   280,  4],  // XS — frequent
  [60,  200,  80,  280,  280,  800,  4],  // S  — frequent
  [200, 500,  280, 700,  800,  2000, 3],  // M  — common
  [500, 1200, 700, 1800, 2000, 5500, 2],  // L  — occasional
  [1200,3000, 1800,4000, 5500, 14000,1],  // XL — rare
] as const;

function pickSize(): [number, number, number, number, number, number] {
  const totalWeight = SIZE_BUCKETS.reduce((s, b) => s + b[6], 0);
  let r = Math.random() * totalWeight;
  for (const b of SIZE_BUCKETS) {
    r -= b[6];
    if (r <= 0) return [b[0], b[1], b[2], b[3], b[4], b[5]];
  }
  return [SIZE_BUCKETS[2][0], SIZE_BUCKETS[2][1], SIZE_BUCKETS[2][2], SIZE_BUCKETS[2][3], SIZE_BUCKETS[2][4], SIZE_BUCKETS[2][5]];
}

function buildBgTraces(): BackgroundTrace[] {
  const traces: BackgroundTrace[] = [];
  // Days 14-29: lower volume (older history)
  for (let d = 29; d >= 14; d--) {
    const count = randInt(1, 4);
    for (let i = 0; i < count; i++) {
      const m = BG_MODELS[randInt(0, BG_MODELS.length - 1)]!;
      const [inMin, inMax, outMin, outMax, durMin, durMax] = pickSize();
      traces.push({
        ...m,
        daysAgoOffset: d,
        inputTokens:  randInt(inMin,  inMax),
        outputTokens: randInt(outMin, outMax),
        durationMs:   randInt(durMin, durMax),
      });
    }
  }
  // Days 1-13: heavier volume (recent activity)
  for (let d = 13; d >= 1; d--) {
    const count = randInt(3, 9);
    for (let i = 0; i < count; i++) {
      const m = BG_MODELS[randInt(0, BG_MODELS.length - 1)]!;
      const [inMin, inMax, outMin, outMax, durMin, durMax] = pickSize();
      traces.push({
        ...m,
        daysAgoOffset: d,
        inputTokens:  randInt(inMin,  inMax),
        outputTokens: randInt(outMin, outMax),
        durationMs:   randInt(durMin, durMax),
      });
    }
  }
  return traces;
}

const BG_PROMPTS = [
  "Summarize this paragraph in one sentence.",
  "Convert this JSON to TypeScript interfaces.",
  "Fix the syntax error in this function.",
  "Write a unit test for this module.",
  "Explain what this regex does.",
  "Translate this message to French.",
  "Suggest a better variable name for 'x'.",
  "What's the time complexity of this algorithm?",
  "Rewrite this loop using Array.map.",
  "Generate a commit message for these changes.",
  "What are the tradeoffs between SQL and NoSQL for this use case?",
  "Review this pull request description for clarity.",
  "Write JSDoc for this function.",
  "Is this TypeScript type correct? Explain why.",
  "What does this shell one-liner do step by step?",
];

const BG_RESPONSES = [
  "The paragraph describes how microservices architecture decomposes a monolithic application into independently deployable services that communicate over well-defined APIs.",
  "```typescript\ninterface User {\n  id: number;\n  name: string;\n  email: string;\n  role: 'admin' | 'viewer';\n  createdAt: string;\n}\n\ninterface ApiResponse<T> {\n  data: T;\n  total: number;\n  page: number;\n}\n```",
  "The issue is a missing closing parenthesis on line 4. Here's the corrected version:\n\n```js\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n```",
  "```typescript\nimport { describe, it, expect } from 'vitest';\nimport { formatCurrency } from './format';\n\ndescribe('formatCurrency', () => {\n  it('formats positive numbers', () => {\n    expect(formatCurrency(1234.5)).toBe('$1,234.50');\n  });\n  it('formats zero', () => {\n    expect(formatCurrency(0)).toBe('$0.00');\n  });\n});\n```",
  "The pattern `/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/` validates email addresses: `^` anchors the start, `[a-zA-Z0-9._%+-]+` matches the local part, `@` is literal, `[a-zA-Z0-9.-]+` matches the domain, `\\.` is a literal dot, and `[a-zA-Z]{2,}$` requires a TLD of at least two characters.",
  "Voici la traduction :\n\n**Anglais :** The deployment pipeline has been updated to include automated security scanning.\n\n**Français :** Le pipeline de déploiement a été mis à jour pour inclure une analyse de sécurité automatisée.",
  "Without more context, here are the most common options:\n- `index` / `idx` — loop counter\n- `count` — accumulating a total\n- `offset` — a byte or array position\n- `value` / `result` — a computed result\n\nPick the name that describes *what* the variable holds, not its type.",
  "The algorithm has **O(n²)** time complexity. The outer loop runs n times and for each iteration the inner loop also runs up to n times, giving n × n total operations. Space complexity is O(1) since no additional data structures are allocated.",
  "```typescript\n// Before\nconst results = [];\nfor (let i = 0; i < items.length; i++) {\n  results.push(items[i].value * 2);\n}\n\n// After\nconst results = items.map(item => item.value * 2);\n```\n\n`Array.map` expresses intent more clearly and avoids the mutable accumulator.",
  "```\nfeat(auth): add refresh token rotation\n\nReplace single long-lived tokens with a short-lived access token (15 min)\nand a rotating refresh token (7 days). Each refresh invalidates the\nprevious token to prevent replay attacks.\n```",
  "**SQL** (PostgreSQL, MySQL) gives you ACID transactions, enforced schema, and powerful JOINs — ideal when your data has clear relationships and consistency matters. **NoSQL** (MongoDB, DynamoDB) offers flexible schemas and horizontal write scaling — better for high-throughput or document-shaped data that varies per record. For relational user and order data, SQL is the safer default unless you're projecting write volumes beyond a single primary's capacity.",
  "The description explains *what* changed but not *why*. Suggested improvements:\n1. **Motivation** — what problem does this fix or feature solve?\n2. **Testing** — manual steps or automated test added?\n3. **Screenshots** if the UI changed.\n\nAlso rename the title from 'Fix stuff' to something specific, e.g. `fix(cart): prevent double-submit on slow connections`.",
  "```typescript\n/**\n * Formats a number as a localized currency string.\n *\n * @param amount - The numeric value to format.\n * @param currency - ISO 4217 currency code (default: `'USD'`).\n * @param locale - BCP 47 locale tag (default: `'en-US'`).\n * @returns A formatted string, e.g. `'$1,234.56'`.\n */\nfunction formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {\n  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);\n}\n```",
  "`Record<string, string | undefined>` is structurally correct for an object with optional string values, but TypeScript won't warn when you access a missing key unless you enable `noUncheckedIndexedAccess`. Use `Partial<Record<string, string>>` for explicit intent, or define a concrete interface if the key set is known at compile time.",
  "```bash\nfind . -name '*.log' | xargs grep -l 'ERROR' | xargs rm\n```\n1. `find . -name '*.log'` — recursively lists all `.log` files under the current directory\n2. `xargs grep -l 'ERROR'` — filters to only filenames that contain the string `ERROR`\n3. `xargs rm` — deletes those files\n\n⚠️ This permanently deletes files. Run with `echo` instead of `rm` first to preview.",
];

async function seedLast24hTraces(token: string): Promise<number> {
  let count = 0;
  for (let h = 23; h >= 0; h--) {
    const perHour = randInt(1, 5);
    for (let i = 0; i < perHour; i++) {
      const m = BG_MODELS[randInt(0, BG_MODELS.length - 1)]!;
      const pi = randInt(0, BG_PROMPTS.length - 1);
      const prompt = BG_PROMPTS[pi]!;
      const reply = BG_RESPONSES[pi]!;
      const ts = hoursAgo(h + Math.random());
      const [inMin, inMax, outMin, outMax, durMin, durMax] = pickSize();
      const inp = randInt(inMin, inMax), out = randInt(outMin, outMax), dur = randInt(durMin, durMax);
      if (m.provider === "anthropic") {
        await seedAnthropic(token, {
          request: { model: m.model, messages: [{ role: "user", content: prompt }], max_tokens: 512 },
          response: {
            id: `msg_${uid()}`, type: "message", role: "assistant",
            content: [{ type: "text", text: reply }],
            model: m.model, stop_reason: "end_turn", stop_sequence: null,
            usage: { input_tokens: inp, output_tokens: out },
          },
          timestamp: ts, durationMs: dur,
        });
      } else {
        await seedOpenAI(token, {
          request: { model: m.model, messages: [{ role: "user", content: prompt }], max_tokens: 512 },
          response: {
            id: `chatcmpl_${uid()}`, object: "chat.completion",
            created: Math.floor(Date.now() / 1000), model: m.model,
            choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
            usage: { prompt_tokens: inp, completion_tokens: out, total_tokens: inp + out },
          },
          timestamp: ts, durationMs: dur,
        });
      }
      count++;
    }
  }
  return count;
}

async function seedBackgroundTraces(token: string): Promise<number> {
  const items = buildBgTraces();
  let count = 0;
  for (const t of items) {
    const pi = randInt(0, BG_PROMPTS.length - 1);
    const prompt = BG_PROMPTS[pi]!;
    const reply = BG_RESPONSES[pi]!;
    const ts = daysAgo(t.daysAgoOffset);
    if (t.provider === "anthropic") {
      await seedAnthropic(token, {
        request: { model: t.model, messages: [{ role: "user", content: prompt }], max_tokens: 512 },
        response: {
          id: `msg_${uid()}`, type: "message", role: "assistant",
          content: [{ type: "text", text: reply }],
          model: t.model, stop_reason: "end_turn", stop_sequence: null,
          usage: { input_tokens: t.inputTokens, output_tokens: t.outputTokens },
        },
        timestamp: ts, durationMs: t.durationMs,
      });
    } else {
      await seedOpenAI(token, {
        request: { model: t.model, messages: [{ role: "user", content: prompt }], max_tokens: 512 },
        response: {
          id: `chatcmpl_${uid()}`, object: "chat.completion",
          created: Math.floor(Date.now() / 1000), model: t.model,
          choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
          usage: { prompt_tokens: t.inputTokens, completion_tokens: t.outputTokens, total_tokens: t.inputTokens + t.outputTokens },
        },
        timestamp: ts, durationMs: t.durationMs,
      });
    }
    count++;
  }
  return count;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌱 LLM Lens demo seed — ${BASE}\n`);

  console.log("1. Auth");
  const token = await registerOrLogin();

  const existing = (await api("GET", "/traces?limit=1", undefined, token)) as { total: number };
  if (existing.total > 0) {
    console.log(`\n  ⚠  Database already has ${existing.total} traces — skipping seed.`);
    console.log("  Delete the demo.db file and re-run to start fresh.\n");
    process.exit(0);
  }

  console.log("2. Org setup");
  await api("PATCH", "/orgs/me", { name: "LLM Lens Demo", retentionDays: 30 }, token);
  console.log("  ✓ Org name set, retention → 30 days");

  console.log("3. Seeding showcase traces (XS/S/M/L/XL)");
  const { starred, noted } = await seedAllTraces(token);
  console.log(`  ✓ ${starred.length + noted.length} showcase traces created`);

  console.log("4. Seeding background traces (30-day history)");
  const bgCount = await seedBackgroundTraces(token);
  console.log(`  ✓ ${bgCount} background traces created`);

  console.log("5. Seeding last-24h hourly traces");
  const h24Count = await seedLast24hTraces(token);
  console.log(`  ✓ ${h24Count} last-24h traces created`);

  console.log("6. Starring traces");
  for (const id of starred) await starTrace(token, id);
  console.log(`  ✓ ${starred.length} traces starred`);

  console.log("7. Adding notes");
  for (const [id, body] of noted) await addNote(token, id, body);
  console.log(`  ✓ ${noted.length} notes added`);

  console.log("8. Creating API keys");
  await api("POST", "/keys", { name: "production", env: "production", scopes: ["read", "write"] }, token);
  await api("POST", "/keys", { name: "staging",    env: "staging",    scopes: ["read", "write"] }, token);
  await api("POST", "/keys", { name: "ci",         env: "ci",         scopes: ["read"] }, token);
  console.log("  ✓ 3 API keys created (production, staging, ci)");

  console.log(`\n✅ Demo ready at ${API_URL.replace("3032", "3031")}\n`);
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}\n`);
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err.message);
  process.exit(1);
});
