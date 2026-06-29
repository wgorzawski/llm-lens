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
  // Try register first; 409 = already exists → fall through to login
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

async function seedAllTraces(token: string): Promise<{ starred: string[]; noted: Array<[string, string]> }> {
  const starred: string[] = [];
  const noted: Array<[string, string]> = [];

  // ── ANTHROPIC ──────────────────────────────────────────────────────────────

  // 1. TypeScript debounce — sonnet, fast, 2d ago
  const t1 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Write a TypeScript utility function that debounces function calls. Include proper types and a usage example." }],
      max_tokens: 1024,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "Here's a fully-typed TypeScript debounce implementation:\n\n```typescript\nfunction debounce<T extends (...args: unknown[]) => void>(\n  fn: T,\n  delay: number\n): (...args: Parameters<T>) => void {\n  let timer: ReturnType<typeof setTimeout>;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), delay);\n  };\n}\n\n// Usage\nconst handleSearch = debounce((query: string) => {\n  console.log('Searching for:', query);\n}, 300);\n```\n\nThe generic constraint `T extends (...args: unknown[]) => void` ensures the function is callable, while `Parameters<T>` preserves the original parameter types." }],
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 32, output_tokens: 148 },
    },
    timestamp: daysAgo(2),
    durationMs: 342,
  });
  starred.push(t1);

  // 2. Async/await explanation — haiku, very fast, 1d ago
  const t2 = await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Explain async/await in JavaScript with a concise practical example." }],
      max_tokens: 512,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "Async/await is syntactic sugar over Promises that makes asynchronous code read like synchronous code.\n\n```javascript\n// Without async/await\nfetch('/api/user')\n  .then(r => r.json())\n  .then(user => console.log(user))\n  .catch(err => console.error(err));\n\n// With async/await\nasync function loadUser() {\n  try {\n    const response = await fetch('/api/user');\n    const user = await response.json();\n    console.log(user);\n  } catch (err) {\n    console.error(err);\n  }\n}\n```\n\n`await` pauses execution inside the `async` function until the Promise resolves, without blocking the main thread." }],
      model: "claude-haiku-4-5",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 18, output_tokens: 142 },
    },
    timestamp: hoursAgo(14),
    durationMs: 180,
  });
  void t2;

  // 3. Multi-turn code review — sonnet, medium, 3d ago
  const t3 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "Review this Python function:\n\ndef get_user(id):\n    conn = db.connect()\n    result = conn.execute(f'SELECT * FROM users WHERE id = {id}')\n    return result.fetchone()" },
        { role: "assistant", content: "I see two critical issues:\n\n1. **SQL injection vulnerability** — you're interpolating `id` directly into the query string. An attacker could pass `1 OR 1=1` to extract all users.\n\n2. **Connection leak** — `conn` is never closed, which will exhaust your connection pool under load.\n\nI'd fix it like this:\n\n```python\ndef get_user(user_id: int):\n    with db.connect() as conn:\n        result = conn.execute(\n            'SELECT * FROM users WHERE id = ?',\n            (user_id,)\n        )\n        return result.fetchone()\n```" },
        { role: "user", content: "Good catch. How should I handle the case where the user doesn't exist?" },
      ],
      max_tokens: 1024,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "Return `None` and let the caller decide what to do — don't raise exceptions for expected absence:\n\n```python\ndef get_user(user_id: int) -> dict | None:\n    with db.connect() as conn:\n        result = conn.execute(\n            'SELECT * FROM users WHERE id = ?',\n            (user_id,)\n        )\n        row = result.fetchone()\n        return dict(row) if row else None\n\n# Caller handles the None case explicitly\nuser = get_user(42)\nif user is None:\n    return 404, {'error': 'User not found'}\n```\n\nThis keeps the function pure and testable — it has one job (fetch a user) and doesn't mix concerns with HTTP semantics." }],
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 198, output_tokens: 162 },
    },
    timestamp: daysAgo(3),
    durationMs: 1100,
  });
  starred.push(t3);
  noted.push([t3, "Good example of a multi-turn code review — SQL injection + resource leak caught early."]);

  // 4. System prompt + TypeScript types — haiku, fast, 5d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      system: "You are a senior TypeScript developer. Give precise, opinionated answers. No preamble.",
      messages: [{ role: "user", content: "What's the practical difference between `type` and `interface` in TypeScript? When should I use each?" }],
      max_tokens: 512,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "Use **`interface`** for object shapes you expect others to extend or implement — it supports declaration merging and is slightly better for OOP patterns.\n\nUse **`type`** for everything else: unions, intersections, mapped types, conditional types, tuples.\n\n```typescript\n// Interface — good for extensible object shapes\ninterface User { id: string; email: string; }\ninterface AdminUser extends User { permissions: string[]; }\n\n// Type — good for unions and computed types\ntype Status = 'idle' | 'loading' | 'error';\ntype Nullable<T> = T | null;\ntype Keys = keyof User; // 'id' | 'email'\n```\n\nPractical rule: default to `type`, switch to `interface` only when you need extends or declaration merging." }],
      model: "claude-haiku-4-5",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 44, output_tokens: 174 },
    },
    timestamp: daysAgo(5),
    durationMs: 420,
  });

  // 5. Tool use — weather — sonnet, warn, 1d ago
  const t5 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "What's the current weather in Warsaw? I need to decide whether to bring an umbrella." }],
      max_tokens: 1024,
      tools: [{
        name: "get_weather",
        description: "Get current weather for a location",
        input_schema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City name or coordinates" },
            units: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature units" },
          },
          required: ["location"],
        },
      }],
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{
        type: "tool_use",
        id: `toolu_${uid()}`,
        name: "get_weather",
        input: { location: "Warsaw, Poland", units: "celsius" },
      }],
      model: "claude-sonnet-4-6",
      stop_reason: "tool_use", stop_sequence: null,
      usage: { input_tokens: 92, output_tokens: 48 },
    },
    timestamp: hoursAgo(8),
    durationMs: 1650,
  });
  starred.push(t5);
  noted.push([t5, "Tool use working well — clean tool_use block in response content."]);

  // 6. Business analysis — opus, slow, 7d ago
  const t6 = await seedAnthropic(token, {
    request: {
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "Analyze the following SaaS business model and identify the top 3 risks:\n\nWe're building a B2B analytics platform targeting mid-market companies (50–500 employees). Pricing: $299/seat/month. GTM: outbound sales + PLG. Current ARR: $180k, 8 customers, ACV $22.5k. Team: 6 engineers, 1 sales, 1 CS." }],
      max_tokens: 2048,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "Looking at this business model, I see three critical risks that need immediate attention:\n\n**1. Revenue concentration risk (Critical)**\n8 customers at $22.5k ACV means your top 2–3 customers likely represent 30–40% of ARR. One churn event could materially impact the business. At this stage, you need 15–20 customers before the concentration risk becomes manageable.\n\n**2. GTM motion conflict (High)**\nOutbound sales and PLG are philosophically opposed. Outbound requires a high-touch, consultative sales process; PLG requires a frictionless self-serve path. With 1 sales rep and 6 engineers, you likely lack the resources to execute either well. I'd recommend committing to one motion and staffing accordingly.\n\n**3. Seat-based pricing at $299 creates a ceiling (Medium)**\nMid-market buyers are sensitive to per-seat costs when evaluating ROI. As you expand within accounts, procurement will push back. Consider a hybrid model: platform fee + usage tiers, which removes the ceiling and aligns pricing with value delivered.\n\n**Immediate actions:** Identify your 2 best-fit customers and build 3 more like them before the next funding milestone. This de-risks both the concentration issue and validates your ICP." }],
      model: "claude-opus-4-8",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 148, output_tokens: 282 },
    },
    timestamp: daysAgo(7),
    durationMs: 3800,
  });
  noted.push([t6, "High latency for Opus — expected. Good example to show in latency breakdown."]);

  // 7. SQL query generation — sonnet, fast, 4d ago
  const t7 = await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Write a SQL query to find the top 10 customers by total order value in the last 90 days, including their email and the number of orders they placed." }],
      max_tokens: 512,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "```sql\nSELECT\n  c.email,\n  COUNT(o.id)          AS order_count,\n  SUM(o.total_amount)  AS total_value\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.created_at >= NOW() - INTERVAL '90 days'\n  AND o.status = 'completed'\nGROUP BY c.id, c.email\nORDER BY total_value DESC\nLIMIT 10;\n```\n\nFiltering by `status = 'completed'` prevents refunded/cancelled orders from inflating totals. If you need to include all statuses, remove that clause." }],
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 42, output_tokens: 118 },
    },
    timestamp: daysAgo(4),
    durationMs: 580,
  });
  starred.push(t7);

  // 8. Quick translation — haiku, very fast, 6d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Translate 'The deployment is complete and all systems are operational.' into Polish, German, and French." }],
      max_tokens: 256,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "**Polish:** Wdrożenie zostało zakończone i wszystkie systemy działają poprawnie.\n\n**German:** Die Bereitstellung ist abgeschlossen und alle Systeme sind betriebsbereit.\n\n**French:** Le déploiement est terminé et tous les systèmes sont opérationnels." }],
      model: "claude-haiku-4-5",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 26, output_tokens: 72 },
    },
    timestamp: daysAgo(6),
    durationMs: 198,
  });

  // 9. Summarization — haiku, fast, 8d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Summarize in 3 bullet points: Vector databases store data as high-dimensional embeddings, enabling semantic similarity search rather than exact keyword matching. They're essential for RAG systems, where relevant document chunks are retrieved based on meaning, not just terms. Popular options include Pinecone, Weaviate, Qdrant, and pgvector for PostgreSQL." }],
      max_tokens: 256,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "• Vector databases store data as embeddings (numerical representations) that capture semantic meaning, enabling similarity search beyond keyword matching.\n• They're the backbone of RAG (Retrieval-Augmented Generation) systems, retrieving contextually relevant chunks of text to ground LLM responses.\n• Leading options: Pinecone (managed), Weaviate, Qdrant (open-source), and pgvector (PostgreSQL extension)." }],
      model: "claude-haiku-4-5",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 82, output_tokens: 88 },
    },
    timestamp: daysAgo(8),
    durationMs: 312,
  });

  // 10. Python data processing — sonnet, medium, 2d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Write a Python script that reads a CSV file of sales data (columns: date, product, quantity, price) and outputs a summary: total revenue per product, sorted descending." }],
      max_tokens: 1024,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "```python\nimport csv\nfrom collections import defaultdict\nfrom pathlib import Path\n\ndef summarize_sales(filepath: str) -> dict[str, float]:\n    revenue: dict[str, float] = defaultdict(float)\n\n    with Path(filepath).open() as f:\n        reader = csv.DictReader(f)\n        for row in reader:\n            product = row['product']\n            total = float(row['quantity']) * float(row['price'])\n            revenue[product] += total\n\n    return dict(\n        sorted(revenue.items(), key=lambda x: x[1], reverse=True)\n    )\n\nif __name__ == '__main__':\n    results = summarize_sales('sales.csv')\n    print(f\"{'Product':<30} {'Revenue':>12}\")\n    print('-' * 44)\n    for product, total in results.items():\n        print(f\"{product:<30} ${total:>11,.2f}\")\n```\n\nUsing `csv.DictReader` means column order doesn't matter — it reads by header name. The type annotation `dict[str, float]` requires Python 3.9+." }],
      model: "claude-sonnet-4-6",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 54, output_tokens: 198 },
    },
    timestamp: daysAgo(2),
    durationMs: 720,
  });

  // 11. Architecture discussion — opus, warn, 10d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-opus-4-8",
      messages: [
        { role: "user", content: "We're migrating from a monolith to microservices. Should we use event-driven architecture or direct REST calls between services?" },
        { role: "assistant", content: "This is a foundational decision. For most teams mid-migration, I'd recommend **REST for synchronous workflows** and **events for state changes** — not one or the other.\n\nUse REST when: a service needs an immediate response, you're doing CRUD operations, or the operation is user-facing (latency matters).\n\nUse events when: you're broadcasting that something happened (order placed, payment processed), multiple services need to react, or you can tolerate eventual consistency.\n\nThe anti-pattern to avoid: making everything event-driven because it feels modern. This creates distributed debugging nightmares when tracing a user request across 8 async hops." },
        { role: "user", content: "How do we handle data consistency across services then? We have orders and inventory that need to stay in sync." },
      ],
      max_tokens: 1024,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "For orders + inventory, the Saga pattern is your best option. Two variants:\n\n**Choreography Saga** (simpler, works for your scale):\n1. Order Service publishes `OrderPlaced` event\n2. Inventory Service listens, reserves stock, publishes `StockReserved`\n3. Order Service listens, confirms order, publishes `OrderConfirmed`\n4. If step 2 fails: Inventory publishes `StockUnavailable` → Order Service compensates\n\n**Orchestration Saga** (better for complex flows): A dedicated Saga Orchestrator coordinates the sequence and handles failures explicitly.\n\nFor your case, I'd start with choreography — less infrastructure, easier to implement. Add an **outbox pattern** to guarantee event delivery: write the event to your DB in the same transaction as the state change, then a background worker publishes it. This prevents the 'DB committed but Kafka failed' split-brain problem.\n\nThe critical invariant: every step needs a compensating transaction. Document these before you build." }],
      model: "claude-opus-4-8",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 228, output_tokens: 248 },
    },
    timestamp: daysAgo(10),
    durationMs: 2100,
  });

  // 12. Regex help — haiku, very fast, 12d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Give me a regex to validate email addresses. It should handle subdomains and plus addressing." }],
      max_tokens: 256,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "```\n/^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$/\n```\n\nHandles:\n- Local part: letters, digits, `._%+-` (covers `user+tag@...`)\n- Subdomains: `user@mail.company.co.uk`\n- TLDs up to any length: `.dev`, `.photography`\n\nNote: for production, prefer a dedicated library like `zod` (`z.string().email()`) — the RFC 5322 full spec is notoriously complex to regex correctly." }],
      model: "claude-haiku-4-5",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 22, output_tokens: 98 },
    },
    timestamp: daysAgo(12),
    durationMs: 248,
  });

  // 13. Test writing — haiku, fast, 11d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      system: "You write concise, well-structured unit tests. Use Vitest syntax.",
      messages: [{ role: "user", content: "Write unit tests for a `formatCurrency(amount: number, currency: string): string` function that formats numbers like `formatCurrency(1234.5, 'USD') → '$1,234.50'`." }],
      max_tokens: 512,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "```typescript\nimport { describe, it, expect } from 'vitest';\nimport { formatCurrency } from './formatCurrency';\n\ndescribe('formatCurrency', () => {\n  it('formats USD with comma separators and 2 decimals', () => {\n    expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50');\n  });\n\n  it('formats EUR with correct symbol', () => {\n    expect(formatCurrency(999, 'EUR')).toBe('€999.00');\n  });\n\n  it('handles zero', () => {\n    expect(formatCurrency(0, 'USD')).toBe('$0.00');\n  });\n\n  it('handles large numbers', () => {\n    expect(formatCurrency(1_000_000, 'USD')).toBe('$1,000,000.00');\n  });\n\n  it('rounds to 2 decimal places', () => {\n    expect(formatCurrency(1.005, 'USD')).toBe('$1.01');\n  });\n});\n```" }],
      model: "claude-haiku-4-5",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 62, output_tokens: 198 },
    },
    timestamp: daysAgo(11),
    durationMs: 390,
  });

  // 14. Markdown / docs — haiku, very fast, 13d ago
  await seedAnthropic(token, {
    request: {
      model: "claude-haiku-4-5",
      messages: [{ role: "user", content: "Write a one-paragraph README description for a Node.js library called `trace-kit` that helps developers capture and analyze LLM API calls." }],
      max_tokens: 256,
    },
    response: {
      id: `msg_${uid()}`,
      type: "message", role: "assistant",
      content: [{ type: "text", text: "`trace-kit` is a lightweight Node.js library for capturing, storing, and analyzing calls to LLM APIs such as Anthropic Claude and OpenAI GPT. Drop it into any Node.js application to automatically record request/response pairs, token usage, latency, and cost — with zero changes to your existing prompts or business logic. Traces are queryable via a simple API, making it easy to debug regressions, monitor spend, and build evaluation pipelines on top of real production traffic." }],
      model: "claude-haiku-4-5",
      stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 38, output_tokens: 108 },
    },
    timestamp: daysAgo(13),
    durationMs: 162,
  });

  // ── OPENAI ─────────────────────────────────────────────────────────────────

  // 15. Python data analysis — gpt-4o, medium, 3d ago
  const t15 = await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "Write a Python script using pandas to analyze a DataFrame of user events. Find the top 5 most active users by event count in the last 7 days, and calculate their average session duration." }],
      max_tokens: 1024,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-2024-08-06",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "```python\nimport pandas as pd\nfrom datetime import datetime, timedelta\n\ndef analyze_active_users(df: pd.DataFrame) -> pd.DataFrame:\n    \"\"\"\n    df expected columns: user_id, event_type, timestamp, session_id, duration_seconds\n    \"\"\"\n    cutoff = datetime.now() - timedelta(days=7)\n    recent = df[df['timestamp'] >= cutoff].copy()\n\n    # Top 5 by event count\n    event_counts = (\n        recent.groupby('user_id')\n        .agg(\n            event_count=('event_type', 'count'),\n            avg_session_duration=('duration_seconds', 'mean')\n        )\n        .sort_values('event_count', ascending=False)\n        .head(5)\n        .round({'avg_session_duration': 1})\n    )\n\n    return event_counts\n\n# Example usage\nif __name__ == '__main__':\n    df = pd.read_csv('events.csv', parse_dates=['timestamp'])\n    result = analyze_active_users(df)\n    print(result.to_string())\n```\n\nThe `agg` call computes both metrics in one pass — more efficient than chaining separate groupby operations." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 62, completion_tokens: 188, total_tokens: 250 },
    },
    timestamp: daysAgo(3),
    durationMs: 850,
  });
  starred.push(t15);

  // 16. Quick JS Q&A — gpt-4o-mini, very fast, 1d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "What's the difference between `null` and `undefined` in JavaScript?" }],
      max_tokens: 256,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "`undefined` means a variable has been declared but not assigned a value — it's the default state. `null` is an explicit assignment meaning 'no value'.\n\n```js\nlet x;          // undefined (not yet assigned)\nlet y = null;   // null (intentionally empty)\n\ntypeof undefined // 'undefined'\ntypeof null      // 'object' ← famous JS quirk\n\nnull == undefined   // true (loose equality)\nnull === undefined  // false (strict equality)\n```\n\nConvention: use `undefined` for uninitialized; use `null` when you deliberately want to express 'empty'." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 18, completion_tokens: 122, total_tokens: 140 },
    },
    timestamp: hoursAgo(6),
    durationMs: 218,
  });

  // 17. Email generation — gpt-4o-mini, fast, 2d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Write a short cold outreach email for a B2B SaaS analytics product targeting CTOs of Series A startups. Keep it under 100 words." }],
      max_tokens: 256,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Subject: Cut your p95 LLM latency — without guessing\n\nHi [Name],\n\nAs you scale your AI features, production blind spots get expensive fast — slow prompts, runaway costs, regressions that slip past evals.\n\nWe built LLM Lens to give CTOs a real-time view of every model call: latency, token spend, error rates, and diffs across prompt versions.\n\n5-minute integration, no infrastructure required.\n\nWould a 20-minute demo be worth your time next week?\n\nBest,\n[Sender]" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 38, completion_tokens: 102, total_tokens: 140 },
    },
    timestamp: daysAgo(2),
    durationMs: 340,
  });

  // 18. Multi-turn code debugging — gpt-4o, medium, 4d ago
  const t18 = await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [
        { role: "user", content: "My React useEffect is running twice in development. Here's the code:\n\nuseEffect(() => {\n  fetchUser(userId).then(setUser);\n}, [userId]);\n\nIs this a bug?" },
        { role: "assistant", content: "Not a bug — it's intentional. In React 18 Strict Mode, effects run twice in development to help you find side effects that aren't properly cleaned up. The sequence is: mount → run effect → unmount → remount → run effect again.\n\nYour fetchUser call will fire twice, which is fine if the second response just overwrites the first. But if you have a subscription or event listener, you'll get duplicates.\n\nTo verify: check if this only happens in development. In production, effects run once." },
        { role: "user", content: "Yes, only in dev. But I'm concerned the double fetch is hitting my API rate limits during development. How do I prevent it?" },
      ],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-2024-08-06",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Add an AbortController to cancel the in-flight request when the effect cleans up:\n\n```jsx\nuseEffect(() => {\n  const controller = new AbortController();\n\n  fetchUser(userId, { signal: controller.signal })\n    .then(setUser)\n    .catch(err => {\n      if (err.name !== 'AbortError') throw err;\n    });\n\n  return () => controller.abort();\n}, [userId]);\n```\n\nOn the first (development-only) unmount, `controller.abort()` cancels the first fetch before it resolves. The second mount starts a fresh request. In production, the cleanup never fires early, so you get one fetch as expected.\n\nThis also correctly handles the case where `userId` changes mid-fetch — the old request is aborted before the new one starts." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 164, completion_tokens: 172, total_tokens: 336 },
    },
    timestamp: daysAgo(4),
    durationMs: 1300,
  });
  starred.push(t18);
  noted.push([t18, "Great multi-turn debugging session — AbortController cleanup pattern."]);

  // 19. SQL optimization — gpt-4o, medium, 5d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "This query is slow on a table with 10M rows:\n\nSELECT * FROM orders WHERE status = 'pending' AND created_at > '2024-01-01'\n\nWhat indexes should I add?" }],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-2024-08-06",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Add a composite index on `(status, created_at)`:\n\n```sql\nCREATE INDEX idx_orders_status_created\nON orders (status, created_at DESC);\n```\n\n**Why this order?** Put the equality column (`status`) first — the index can jump directly to all 'pending' rows, then use `created_at` for the range scan. Reversing them would require scanning all rows with `created_at > '2024-01-01'` first.\n\n**Also drop `SELECT *`** — it forces the DB to fetch the full row even after using the index. Specify only the columns you need, or add them to the index for a covering index that never touches the table.\n\n```sql\n-- Covering index if you only need a few columns:\nCREATE INDEX idx_orders_covering\nON orders (status, created_at DESC)\nINCLUDE (id, customer_id, total_amount);\n```\n\nRun `EXPLAIN ANALYZE` before and after to confirm the index is being used." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 68, completion_tokens: 198, total_tokens: 266 },
    },
    timestamp: daysAgo(5),
    durationMs: 780,
  });

  // 20. Very slow trace — gpt-4o, warn, 6d ago
  const t20 = await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "Write a comprehensive technical spec for a distributed rate limiting system that handles 100k requests/second across 50 global regions, with sub-millisecond overhead and eventual consistency guarantees." }],
      max_tokens: 2048,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-2024-08-06",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "# Distributed Rate Limiting System — Technical Spec\n\n## Overview\nA globally distributed token bucket implementation using a gossip protocol for cross-region synchronization, with local-first enforcement to achieve sub-millisecond overhead.\n\n## Architecture\n\n### Local enforcement layer\nEach region maintains an in-memory token bucket per rate-limit key (user_id, api_key, IP). Enforcement is lock-free using atomic compare-and-swap operations on a 64-bit counter. Target overhead: < 50µs per request.\n\n### Synchronization layer\nRegions gossip their consumption counters every 100ms using a CRDT (Grow-Only Counter). Each region tracks its own consumption and receives aggregate consumption from all peers. The global view is computed as the sum of all counters.\n\n### Consistency model\nEventual consistency with a maximum staleness window of `gossip_interval × 2` (200ms). During this window, a burst of up to `(local_limit / region_count) × staleness_factor` tokens may be over-issued globally. For 100k RPS across 50 regions: 2,000 RPS local baseline, ±5% burst tolerance.\n\n## Data structures\n```\nTokenBucket {\n  key: string\n  limit: u64\n  window_ms: u64\n  local_counter: AtomicU64\n  peer_counters: Map<region_id, u64>\n  last_reset: Instant\n}\n```\n\n## Failure modes\n- **Region isolation:** fall back to local limits only; accept higher burst risk\n- **Gossip lag:** widen staleness window; alert if > 500ms\n- **Counter overflow:** reset to 0 at window boundary using distributed two-phase commit\n\n## Deployment\nDeploy as a sidecar alongside each API gateway instance. Co-locate storage (Redis) within the same datacenter to minimize gossip latency. Use Anycast DNS to route requests to the nearest region." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 52, completion_tokens: 388, total_tokens: 440 },
    },
    timestamp: daysAgo(6),
    durationMs: 5800,
  });
  noted.push([t20, "Very slow response (5.8s) — large output token count. Good example for latency analysis."]);

  // 21. Quick summarization — gpt-4o-mini, very fast, 7d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "TL;DR in one sentence: The transformer architecture introduced self-attention mechanisms that allow models to weigh the relevance of different input tokens when generating each output token, enabling parallelization that RNNs couldn't achieve." }],
      max_tokens: 128,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Transformers use self-attention to dynamically focus on relevant input tokens in parallel, solving the sequential bottleneck that limited earlier RNN architectures." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 58, completion_tokens: 26, total_tokens: 84 },
    },
    timestamp: daysAgo(7),
    durationMs: 188,
  });

  // 22. Blog post outline — gpt-4o-mini, fast, 8d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Create a blog post outline for 'How to monitor LLM costs in production'. Target audience: backend engineers. 5 sections max." }],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "**How to Monitor LLM Costs in Production**\n\n**1. Why LLM costs spiral unexpectedly**\n- Token pricing models (input vs output asymmetry)\n- The hidden cost of retries and streaming\n- Real example: $4k/month surprise bill\n\n**2. Instrument every call**\n- Wrapping the SDK vs middleware approach\n- What to capture: model, tokens, latency, user_id, feature_flag\n- Structured logging vs trace storage\n\n**3. Build cost attribution**\n- Tagging by team, feature, and environment\n- Cost per user / cost per API call calculation\n- Anomaly detection thresholds\n\n**4. Alerting that doesn't cry wolf**\n- Budget alerts vs spend-rate alerts\n- Per-model vs aggregate ceilings\n- Runbook: what to do when you hit 80% of budget\n\n**5. Optimizing after you can measure**\n- Cache hit rate as a leading indicator\n- Model downgrades: when haiku is good enough\n- Prompt compression ROI" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 38, completion_tokens: 208, total_tokens: 246 },
    },
    timestamp: daysAgo(8),
    durationMs: 452,
  });

  // 23. Code review — gpt-4o, medium, 9d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "Review this TypeScript function for potential issues:\n\nasync function fetchWithRetry(url: string, retries = 3) {\n  for (let i = 0; i < retries; i++) {\n    try {\n      return await fetch(url);\n    } catch (e) {\n      if (i === retries - 1) throw e;\n    }\n  }\n}" }],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-2024-08-06",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Three issues:\n\n**1. No exponential backoff** — retrying immediately on failure hammers a struggling server. Add a delay: `await new Promise(r => setTimeout(r, 2 ** i * 100))`.\n\n**2. Retries on non-transient errors** — a 404 or 400 won't be fixed by retrying. Check `response.ok` and only retry on network errors or 5xx:\n```typescript\nif (response.status < 500) return response; // don't retry client errors\n```\n\n**3. Missing return type** — implicit `Promise<Response | undefined>`. Add `Promise<Response>` and the compiler will catch the implicit `undefined` if all retries fail (which this code silently returns).\n\nFixed version:\n```typescript\nasync function fetchWithRetry(url: string, retries = 3): Promise<Response> {\n  for (let i = 0; i < retries; i++) {\n    try {\n      const response = await fetch(url);\n      if (response.ok || response.status < 500) return response;\n    } catch (e) {\n      if (i === retries - 1) throw e;\n    }\n    await new Promise(r => setTimeout(r, 2 ** i * 100));\n  }\n  throw new Error('Max retries exceeded');\n}\n```" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 82, completion_tokens: 228, total_tokens: 310 },
    },
    timestamp: daysAgo(9),
    durationMs: 930,
  });

  // 24. Docker setup — gpt-4o, medium, 13d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: "Write a production-ready Dockerfile for a Node.js 22 API. Use multi-stage build, non-root user, and minimize image size." }],
      max_tokens: 512,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-2024-08-06",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "```dockerfile\n# Stage 1: build\nFROM node:22-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --ignore-scripts\nCOPY . .\nRUN npm run build\n\n# Stage 2: production\nFROM node:22-alpine AS runner\nWORKDIR /app\n\n# Non-root user\nRUN addgroup -S appgroup && adduser -S appuser -G appgroup\n\nCOPY package*.json ./\nRUN npm ci --omit=dev --ignore-scripts && npm cache clean --force\n\nCOPY --from=builder /app/dist ./dist\n\nUSER appuser\nEXPOSE 3000\nENTRYPOINT [\"node\", \"dist/index.js\"]\n```\n\nKey decisions: `alpine` base (~50MB vs ~900MB for full node), `--omit=dev` in production stage, `--ignore-scripts` to avoid postinstall footguns, explicit non-root user for container security compliance." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 36, completion_tokens: 192, total_tokens: 228 },
    },
    timestamp: daysAgo(13),
    durationMs: 672,
  });

  // 25. CSS Grid — gpt-4o-mini, fast, 3d ago
  await seedOpenAI(token, {
    request: {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "How do I center a div both horizontally and vertically using CSS Grid in one line?" }],
      max_tokens: 128,
    },
    response: {
      id: `chatcmpl_${uid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4o-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "```css\n.container {\n  display: grid;\n  place-items: center; /* shorthand for align-items + justify-items */\n}\n```\n\n`place-items: center` is the one-liner. Works in all modern browsers. For the child to fill available space, make sure the container has a defined height." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 22, completion_tokens: 62, total_tokens: 84 },
    },
    timestamp: daysAgo(3),
    durationMs: 318,
  });

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

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildBgTraces(): BackgroundTrace[] {
  const traces: BackgroundTrace[] = [];
  // Days 14-29: moderate usage (older history)
  for (let d = 29; d >= 14; d--) {
    const count = randInt(1, 4);
    for (let i = 0; i < count; i++) {
      const m = BG_MODELS[randInt(0, BG_MODELS.length - 1)]!;
      traces.push({
        ...m,
        daysAgoOffset: d,
        inputTokens: randInt(20, 180),
        outputTokens: randInt(40, 250),
        durationMs: randInt(150, 2800),
      });
    }
  }
  // Days 1-13: heavier usage (recent)
  for (let d = 13; d >= 1; d--) {
    const count = randInt(3, 8);
    for (let i = 0; i < count; i++) {
      const m = BG_MODELS[randInt(0, BG_MODELS.length - 1)]!;
      traces.push({
        ...m,
        daysAgoOffset: d,
        inputTokens: randInt(30, 220),
        outputTokens: randInt(60, 320),
        durationMs: randInt(150, 3200),
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
];

async function seedBackgroundTraces(token: string): Promise<number> {
  const items = buildBgTraces();
  let count = 0;
  for (const t of items) {
    const prompt = BG_PROMPTS[randInt(0, BG_PROMPTS.length - 1)]!;
    const ts = daysAgo(t.daysAgoOffset);
    if (t.provider === "anthropic") {
      await seedAnthropic(token, {
        request: {
          model: t.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 512,
        },
        response: {
          id: `msg_${uid()}`,
          type: "message", role: "assistant",
          content: [{ type: "text", text: "Here is the result for your request." }],
          model: t.model,
          stop_reason: "end_turn", stop_sequence: null,
          usage: { input_tokens: t.inputTokens, output_tokens: t.outputTokens },
        },
        timestamp: ts,
        durationMs: t.durationMs,
      });
    } else {
      await seedOpenAI(token, {
        request: {
          model: t.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 512,
        },
        response: {
          id: `chatcmpl_${uid()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: t.model,
          choices: [{
            index: 0,
            message: { role: "assistant", content: "Here is the result for your request." },
            finish_reason: "stop",
          }],
          usage: { prompt_tokens: t.inputTokens, completion_tokens: t.outputTokens, total_tokens: t.inputTokens + t.outputTokens },
        },
        timestamp: ts,
        durationMs: t.durationMs,
      });
    }
    count++;
  }
  return count;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌱 LLM Lens demo seed — ${BASE}\n`);

  // 1. Auth
  console.log("1. Auth");
  const token = await registerOrLogin();

  // 2. Check if already seeded
  const existing = (await api("GET", "/traces?limit=1", undefined, token)) as { total: number };
  if (existing.total > 0) {
    console.log(`\n  ⚠  Database already has ${existing.total} traces — skipping seed.`);
    console.log("  Delete the demo.db file and re-run to start fresh.\n");
    process.exit(0);
  }

  // 3. Org setup
  console.log("2. Org setup");
  await api("PATCH", "/orgs/me", { name: "LLM Lens Demo", retentionDays: 30 }, token);
  console.log("  ✓ Org name set, retention → 30 days");

  // 4. Seed feature traces
  console.log("3. Seeding showcase traces");
  const { starred, noted } = await seedAllTraces(token);
  console.log(`  ✓ 25 showcase traces created`);

  // 5. Seed background volume for dashboard charts
  console.log("4. Seeding background traces (30-day history)");
  const bgCount = await seedBackgroundTraces(token);
  console.log(`  ✓ ${bgCount} background traces created`);

  // 6. Star traces
  console.log("5. Starring traces");
  for (const id of starred) await starTrace(token, id);
  console.log(`  ✓ ${starred.length} traces starred`);

  // 7. Add notes
  console.log("6. Adding notes");
  for (const [id, body] of noted) await addNote(token, id, body);
  console.log(`  ✓ ${noted.length} notes added`);

  // 8. API keys
  console.log("7. Creating API keys");
  await api("POST", "/keys", { name: "production" }, token);
  await api("POST", "/keys", { name: "staging" }, token);
  console.log("  ✓ 2 API keys created (production, staging)");

  console.log(`\n✅ Demo ready at ${API_URL.replace("3032", "3031")}\n`);
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}\n`);
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err.message);
  process.exit(1);
});
