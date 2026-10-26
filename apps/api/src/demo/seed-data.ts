// Demo seed data. Used by the API itself in DEMO_MODE (services/demo-maintenance.ts)
// to fill the shared demo account. Most traces go through the real ingest routes (via
// server.inject) so they are parsed exactly like real ones; error traces and replays
// can't be produced by ingest, so those are inserted directly.
//
// Bump DEMO_SEED_VERSION whenever this content changes - the API then replaces the
// demo account's traces on its next start (visitor accounts are left alone).

import type { AnthropicRawLog, OpenAIRawLog, TraceMessage, UnifiedTrace, VercelAIRawLog } from "@llm-lens/types";
import { parseAnthropicLog } from "@llm-lens/parsers";

export const DEMO_SEED_VERSION = 3;

export type DemoApiCall = (method: string, path: string, body?: unknown) => Promise<unknown>;

export interface DemoSeedContext {
  api: DemoApiCall;
  /** Direct DB insert, for traces the ingest routes can't produce (errors, replays). */
  insertTrace: (trace: UnifiedTrace, replayOf?: string) => Promise<void>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const ago = (ms: number): number => Date.now() - ms;
// Showcase traces fill the last ~3 hours, newest = most impressive, so the first
// page of the trace list shows them before any background traffic.
const showcaseAt = (rank: number): number => ago(3 * MIN + rank * 11 * MIN);
const isoDate = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function rid(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  return s;
}
const anthropicId = () => `msg_01${rid(22)}`;
const openaiId = () => `chatcmpl-${rid(29)}`;
const vercelId = () => `aisdk_${rid(24)}`;
const toolId = () => `toolu_01${rid(22)}`;
const callId = () => `call_${rid(24)}`;

const tokens = (prompt: number, completion: number) =>
  ({ prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion });
const vercelTokens = (prompt: number, completion: number) =>
  ({ promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion });

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

async function ingestAnthropic(ctx: DemoSeedContext, log: AnthropicRawLog): Promise<string> {
  return ((await ctx.api("POST", "/traces/anthropic", log)) as { id: string }).id;
}
async function ingestOpenAI(ctx: DemoSeedContext, log: OpenAIRawLog): Promise<string> {
  return ((await ctx.api("POST", "/traces/openai", log)) as { id: string }).id;
}
async function ingestVercel(ctx: DemoSeedContext, log: VercelAIRawLog): Promise<string> {
  return ((await ctx.api("POST", "/traces/vercel-ai", log)) as { id: string }).id;
}

// A failed LLM call: the request is recorded, there is no assistant reply.
async function insertErrorTrace(
  ctx: DemoSeedContext,
  o: {
    provider: "anthropic" | "openai" | "vercel-ai";
    model: string;
    timestamp: number;
    durationMs: number;
    statusCode: number;
    error: string;
    systemPrompt?: string;
    messages: TraceMessage[];
    inputTokens?: number;
  },
): Promise<string> {
  const id = o.provider === "openai" ? openaiId() : o.provider === "anthropic" ? anthropicId() : vercelId();
  await ctx.insertTrace({
    id,
    timestamp: new Date(o.timestamp).toISOString(),
    messages: o.messages,
    usage: { inputTokens: o.inputTokens ?? 0, outputTokens: 0 },
    metadata: {
      model: o.model,
      provider: o.provider,
      durationMs: o.durationMs,
      costUsd: 0,
      statusCode: o.statusCode,
      error: o.error,
      systemPrompt: o.systemPrompt,
    },
    raw: { error: { status: o.statusCode, message: o.error } },
  });
  return id;
}

// ── shared prompts and tools ──────────────────────────────────────────────────

const SUPPORT_SYSTEM = `You are Nova, the support agent for Northwind Cloud (B2B analytics SaaS).

## Tone
- Friendly, concise, no corporate filler. Use the customer's first name.
- Never blame the customer. Own mistakes on our side.

## Billing policy
- Duplicate charges: refund the duplicate immediately, no approval needed.
- Refunds up to $500 can be issued by you; above that, escalate to billing@northwind.io.
- Refunds land in 5-10 business days depending on the bank.
- Plan downgrades take effect at the end of the billing period; no partial refunds.

## Tools
- Always verify the customer with lookup_customer before touching billing.
- Use list_charges to confirm a billing problem before acting on it.
- Explain every action you take in plain language.

## Escalation
Escalate to a human (handoff_to_human) for: legal threats, security incidents,
data deletion requests, or anything you are not sure about.`;

const SUPPORT_TOOLS = [
  {
    name: "lookup_customer",
    description: "Find a customer account by e-mail. Returns plan, seats and account status.",
    input_schema: {
      type: "object",
      properties: { email: { type: "string", format: "email" } },
      required: ["email"],
    },
  },
  {
    name: "list_charges",
    description: "List card charges for a customer, newest first.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        since: { type: "string", format: "date", description: "ISO date, inclusive" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "issue_refund",
    description: "Refund a charge, fully or partially. Max $500 without escalation.",
    input_schema: {
      type: "object",
      properties: {
        charge_id: { type: "string" },
        amount_cents: { type: "integer" },
        reason: { type: "string", enum: ["duplicate", "requested_by_customer", "service_issue"] },
      },
      required: ["charge_id", "amount_cents", "reason"],
    },
  },
  {
    name: "handoff_to_human",
    description: "Escalate the conversation to the human support queue.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" }, priority: { type: "string", enum: ["low", "normal", "high"] } },
      required: ["summary"],
    },
  },
];

const HANDBOOK_SYSTEM = `You answer employee questions using ONLY the handbook excerpts below.
Cite sources as [n]. If the excerpts don't cover the question, say so and suggest asking People Ops.

<handbook>
[1] Remote work (section 4.2)
Employees may work remotely from any country for up to 90 days per calendar year,
provided the country is not on the restricted list (Appendix C) and the employee
notifies their manager and People Ops at least 14 days in advance. Stays longer than
90 days require a tax and immigration review, which People Ops arranges with our
employer-of-record partner. Core collaboration hours (13:00-16:00 CET) still apply.

[2] Restricted countries (Appendix C)
Due to sanctions and data-protection requirements, remote work is not permitted from:
Russia, Belarus, Iran, North Korea, Syria, Cuba. Access to production systems from
these countries is blocked at the network level.

[3] Home-office stipend (section 6.1)
Full-time employees receive a monthly home-office stipend of EUR 75, paid with the
salary. The stipend continues during temporary remote stays abroad. It is paused
during unpaid leave and parental leave longer than 30 days.

[4] Equipment (section 6.3)
Laptops are replaced every 3 years. Monitors, chairs and desks can be expensed once
every 4 years up to EUR 900 in total. Equipment remains company property and must be
returned when leaving.

[5] Parental leave (section 7.4)
Birthing parents receive 20 weeks of fully paid leave, non-birthing parents 12 weeks.
Leave can be split into at most three blocks within 18 months of the birth or adoption.

[6] Learning budget (section 8.2)
Every employee has a yearly learning budget of EUR 1,500 for courses, conferences and
books. Unused budget does not roll over. Conference travel counts against the budget.

[7] Travel (section 9.1)
Book trains for trips under 6 hours. Flights must be economy class except for
long-haul flights over 8 hours, where premium economy is allowed.
</handbook>`;

// ── showcase traces ───────────────────────────────────────────────────────────

interface Showcase {
  starred: string[];
  notes: Array<[string, string]>;
}

async function seedShowcase(ctx: DemoSeedContext): Promise<Showcase> {
  const starred: string[] = [];
  const notes: Array<[string, string]> = [];

  // 1. Support agent with a full tool loop and a cached system prompt ─────────
  {
    const chargeDate = isoDate(ago(9 * DAY));
    const t1 = toolId(), t2 = toolId(), t3 = toolId();
    const id = await ingestAnthropic(ctx, {
      request: {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        temperature: 0.3,
        system: [{ type: "text", text: SUPPORT_SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: SUPPORT_TOOLS,
        messages: [
          { role: "user", content: "Hi, I was charged twice for our Pro plan this month (order A-20931). Can you sort this out? It's maya.chen@northwind-retail.com" },
          { role: "assistant", content: [
            { type: "text", text: "Sorry about that, Maya - let me pull up your account first." },
            { type: "tool_use", id: t1, name: "lookup_customer", input: { email: "maya.chen@northwind-retail.com" } },
          ] },
          { role: "user", content: [
            { type: "tool_result", tool_use_id: t1, content: JSON.stringify({ customer_id: "cus_R8fK2mQx", name: "Maya Chen", company: "Northwind Retail", plan: "pro_monthly", seats: 12, status: "active", since: "2024-03-14" }) },
          ] },
          { role: "assistant", content: [
            { type: "tool_use", id: t2, name: "list_charges", input: { customer_id: "cus_R8fK2mQx", since: isoDate(ago(30 * DAY)) } },
          ] },
          { role: "user", content: [
            { type: "tool_result", tool_use_id: t2, content: JSON.stringify([
              { charge_id: "ch_3QxT81Lk", amount_cents: 58800, currency: "usd", created: `${chargeDate}T08:14:02Z`, description: "Pro plan - 12 seats", status: "succeeded" },
              { charge_id: "ch_3QxT7zPa", amount_cents: 58800, currency: "usd", created: `${chargeDate}T08:13:57Z`, description: "Pro plan - 12 seats", status: "succeeded" },
            ]) },
          ] },
          { role: "assistant", content: [
            { type: "text", text: "Confirmed: two identical charges of $588.00, five seconds apart. That's above my $500 limit for a normal refund, but our policy lets me refund duplicates immediately, so I'm refunding the second one now." },
            { type: "tool_use", id: t3, name: "issue_refund", input: { charge_id: "ch_3QxT81Lk", amount_cents: 58800, reason: "duplicate" } },
          ] },
          { role: "user", content: [
            { type: "tool_result", tool_use_id: t3, content: JSON.stringify({ refund_id: "re_9LmN4tYw", status: "succeeded", amount_cents: 58800, expected_arrival: "5-10 business days" }) },
          ] },
        ],
      },
      response: {
        id: anthropicId(), type: "message", role: "assistant", model: "claude-sonnet-4-6",
        stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: "All sorted, Maya. Here's what happened and what I did:\n\n**What went wrong:** your card was charged $588.00 twice for the Pro plan (12 seats), five seconds apart. That's a duplicate on our side - most likely a retried payment request.\n\n**What I did:** refunded the duplicate charge (`ch_3QxT81Lk`) in full. Refund reference: **re_9LmN4tYw**.\n\n**When you'll see it:** usually 5-10 business days, depending on your bank. Your Pro subscription is untouched - all 12 seats stay active.\n\nIf the refund hasn't shown up after 10 business days, reply to this thread with the reference above and I'll chase it with our payment provider. Anything else I can help with?" }],
        usage: { input_tokens: 1846, output_tokens: 214, cache_read_input_tokens: 1310, cache_creation_input_tokens: 0 },
      },
      timestamp: showcaseAt(0),
      durationMs: 3920,
    });
    starred.push(id);
    notes.push([id, "Golden path for the duplicate-charge flow: verify → confirm → refund → explain. Note the agent correctly applied the duplicate exception to the $500 refund limit. Use this as an eval fixture."]);
  }

  // 2. Coding agent: failing test (tool error), fix, green run ─────────────────
  {
    const r = toolId(), t1 = toolId(), w = toolId(), t2 = toolId();
    const original = `export async function getInvoice(req: Request, res: Response) {
  const invoice = await db.invoices.findById(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const customer = await db.customers.findById(invoice.customerId);
  const taxRate = TAX_RATES[customer.billingAddress.country] ?? 0;

  return res.json({
    ...invoice,
    tax: Math.round(invoice.subtotal * taxRate),
    total: Math.round(invoice.subtotal * (1 + taxRate)),
  });
}`;
    const fixed = `export async function getInvoice(req: Request, res: Response) {
  const invoice = await db.invoices.findById(req.params.id);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const customer = await db.customers.findById(invoice.customerId);
  // Customers created through the API may not have a billing address yet.
  const country = customer?.billingAddress?.country;
  const taxRate = country ? (TAX_RATES[country] ?? 0) : 0;

  return res.json({
    ...invoice,
    tax: Math.round(invoice.subtotal * taxRate),
    total: Math.round(invoice.subtotal * (1 + taxRate)),
    taxEstimated: !country,
  });
}`;
    const id = await ingestAnthropic(ctx, {
      request: {
        model: "claude-opus-4-8",
        max_tokens: 4096,
        system: [{ type: "text", text: "You are a senior engineer working in the billing-service repository (TypeScript, Express, Vitest). Make the smallest change that fixes the problem, run the relevant tests before and after, and finish with a short summary of the root cause and the fix.", cache_control: { type: "ephemeral" } }],
        tools: [
          { name: "read_file", description: "Read a file from the repository.", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
          { name: "write_file", description: "Overwrite a file in the repository.", input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
          { name: "run_tests", description: "Run Vitest, optionally filtered by a name pattern.", input_schema: { type: "object", properties: { pattern: { type: "string" } } } },
        ],
        messages: [
          { role: "user", content: "GET /invoices/:id returns a 500 for customers that don't have a billing address yet (Sentry BILLING-3F2). Fix it and make sure the invoice tests pass." },
          { role: "assistant", content: [
            { type: "text", text: "I'll start by reading the route handler." },
            { type: "tool_use", id: r, name: "read_file", input: { path: "src/routes/invoices.ts" } },
          ] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: r, content: original }] },
          { role: "assistant", content: [
            { type: "text", text: "`customer.billingAddress.country` will throw when `billingAddress` is null. Let me reproduce it with the existing tests first." },
            { type: "tool_use", id: t1, name: "run_tests", input: { pattern: "invoices" } },
          ] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: t1, is_error: true, content: " FAIL  src/routes/invoices.test.ts > GET /invoices/:id > returns an invoice for a customer without billing address\nTypeError: Cannot read properties of null (reading 'country')\n ❯ getInvoice src/routes/invoices.ts:6:52\n\n Test Files  1 failed (1)\n      Tests  1 failed | 11 passed (12)\n   Duration  1.84s" }] },
          { role: "assistant", content: [
            { type: "text", text: "Reproduced. I'll guard the lookup, fall back to a zero tax rate, and flag the response so the UI can show the tax as an estimate." },
            { type: "tool_use", id: w, name: "write_file", input: { path: "src/routes/invoices.ts", content: fixed } },
          ] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: w, content: "Wrote 612 bytes to src/routes/invoices.ts" }] },
          { role: "assistant", content: [{ type: "tool_use", id: t2, name: "run_tests", input: { pattern: "invoices" } }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: t2, content: " ✓ src/routes/invoices.test.ts (12 tests) 412ms\n\n Test Files  1 passed (1)\n      Tests  12 passed (12)\n   Duration  1.61s" }] },
        ],
      },
      response: {
        id: anthropicId(), type: "message", role: "assistant", model: "claude-opus-4-8",
        stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: "Fixed - all 12 invoice tests pass.\n\n**Root cause:** customers created through the public API can exist without a billing address. `getInvoice` read `customer.billingAddress.country` unconditionally, so those invoices threw a `TypeError` and the route returned 500.\n\n**Fix** (`src/routes/invoices.ts`):\n- read the country with optional chaining and fall back to a 0% tax rate when it's missing;\n- add `taxEstimated: true` to the response in that case, so the dashboard can label the tax as an estimate instead of silently showing $0.\n\n**Worth a follow-up:** the invoice should probably not be finalised at all without a billing address - tax is legally required in several of our markets. I'd suggest blocking `POST /invoices/:id/finalize` until the address is set; happy to do that in a separate change." }],
        usage: { input_tokens: 2984, output_tokens: 1062, cache_read_input_tokens: 2240, cache_creation_input_tokens: 0 },
      },
      timestamp: showcaseAt(1),
      durationMs: 18740,
    });
    starred.push(id);
    notes.push([id, "Nice example of the agent using the failing test as a reproduction before editing. Follow-up suggested at the end (block finalize without address) → created BILL-412."]);
  }

  // 3. RAG over a cached handbook - most input tokens come from the cache ──────
  {
    const id = await ingestAnthropic(ctx, {
      request: {
        model: "claude-haiku-4-5",
        max_tokens: 600,
        temperature: 0,
        system: [{ type: "text", text: HANDBOOK_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: "I'm planning to spend February and March in Lisbon with my partner and keep working from there. Is that allowed, and do I still get the home-office stipend while I'm abroad?" }],
      },
      response: {
        id: anthropicId(), type: "message", role: "assistant", model: "claude-haiku-4-5",
        stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: "Yes to both:\n\n- **Working from Lisbon:** allowed. You can work remotely from any non-restricted country for up to 90 days per calendar year [1], and Portugal isn't on the restricted list [2]. February and March together are 59 days (60 in a leap year), so you're within the limit. Let your manager and People Ops know at least 14 days before you leave, and keep the core hours of 13:00-16:00 CET [1] - Lisbon is one hour behind, so that's 12:00-15:00 local time.\n- **Home-office stipend:** it keeps being paid during temporary stays abroad - EUR 75 a month with your salary [3].\n\nIf the trip might run past 90 days, tell People Ops early: longer stays need a tax and immigration review [1]." }],
        usage: { input_tokens: 64, output_tokens: 231, cache_read_input_tokens: 1138, cache_creation_input_tokens: 0 },
      },
      timestamp: showcaseAt(6),
      durationMs: 1180,
    });
    notes.push([id, "Prompt caching at work: the handbook is cached, so almost all input tokens are cache reads. Cost per question is a fraction of an uncached call."]);
  }

  // 4. Vision + forced tool call: receipt → structured expense ─────────────────
  {
    const id = await ingestAnthropic(ctx, {
      request: {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        temperature: 0,
        system: "You turn photos of receipts into expense records. Copy amounts exactly as printed; never guess missing values - use null instead.",
        tools: [{
          name: "record_expense",
          description: "Store an expense extracted from a receipt.",
          input_schema: {
            type: "object",
            properties: {
              merchant: { type: "string" }, address: { type: "string" }, date: { type: "string", format: "date" },
              time: { type: "string" }, receipt_number: { type: "string" }, currency: { type: "string" },
              items: { type: "array", items: { type: "object", properties: { description: { type: "string" }, quantity: { type: "number" }, amount: { type: "number" } } } },
              total: { type: "number" }, vat: { type: "number" }, payment_method: { type: "string" },
            },
            required: ["merchant", "date", "currency", "items", "total"],
          },
        }],
        tool_choice: { type: "tool", name: "record_expense" },
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "url", media_type: "image/jpeg", url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Sahan_Supermarket_receipt%2C_Hillegersberg%2C_Rotterdam_%282021%29_02.jpg/960px-Sahan_Supermarket_receipt%2C_Hillegersberg%2C_Rotterdam_%282021%29_02.jpg" } },
          { type: "text", text: "Add this to my expense report for the Rotterdam offsite (snacks for the workshop)." },
        ] }],
      },
      response: {
        id: anthropicId(), type: "message", role: "assistant", model: "claude-sonnet-4-6",
        stop_reason: "tool_use", stop_sequence: null,
        content: [{ type: "tool_use", id: toolId(), name: "record_expense", input: {
          merchant: "SAHAN Supermarkt",
          address: "Bergweg 170, 3036 BL Rotterdam",
          date: "2021-01-26",
          time: "11:29",
          receipt_number: "2-00005155",
          currency: "EUR",
          items: [
            { description: "Miras olive oil (glass) 1L", quantity: 1, amount: 3.99 },
            { description: "Meray Trakya pumpkin seeds 200g", quantity: 1, amount: 1.99 },
            { description: "Pinar pumpkin seeds 200g", quantity: 1, amount: 1.99 },
            { description: "Ülker Petibör biscuits 1kg", quantity: 1, amount: 2.49 },
            { description: "Simit bread (5 × 0.75)", quantity: 5, amount: 3.75 },
          ],
          total: 14.21,
          vat: 1.17,
          payment_method: "PIN (debit card)",
        } }],
        usage: { input_tokens: 1702, output_tokens: 341 },
      },
      timestamp: showcaseAt(2),
      durationMs: 4310,
    });
    starred.push(id);
  }

  // 5. OpenAI: parallel function calls, then the final answer ─────────────────
  {
    const w = callId(), f = callId();
    const id = await ingestOpenAI(ctx, {
      request: {
        model: "gpt-4o",
        temperature: 0.4,
        max_tokens: 800,
        tools: [
          { type: "function", function: { name: "get_weather", description: "Daily forecast for a city.", parameters: { type: "object", properties: { city: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 7 } }, required: ["city"] } } },
          { type: "function", function: { name: "search_flights", description: "Search flights between two airports.", parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, date: { type: "string" }, depart_after: { type: "string" }, direct_only: { type: "boolean" } }, required: ["from", "to", "date"] } } },
        ],
        messages: [
          { role: "system", content: "You are a travel assistant for business travellers. Be brief and practical. Prices in EUR." },
          { role: "user", content: "I'm at a conference in Kraków on Thursday and Friday. What's the weather going to be like, and can you find me a direct flight back to Amsterdam on Friday evening?" },
          { role: "assistant", content: null, tool_calls: [
            { id: w, type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "Kraków", days: 2 }) } },
            { id: f, type: "function", function: { name: "search_flights", arguments: JSON.stringify({ from: "KRK", to: "AMS", date: "friday", depart_after: "17:00", direct_only: true }) } },
          ] },
          { role: "tool", tool_call_id: w, content: JSON.stringify([{ day: "Thursday", high_c: 9, low_c: 2, summary: "cloudy, light rain after 15:00" }, { day: "Friday", high_c: 11, low_c: 3, summary: "sunny intervals, windy" }]) },
          { role: "tool", tool_call_id: f, content: JSON.stringify([{ flight: "KL1998", depart: "18:05", arrive: "20:20", price_eur: 164, seats_left: 4 }, { flight: "LO269", depart: "20:40", arrive: "22:55", price_eur: 121, seats_left: 9 }]) },
        ],
      },
      response: {
        id: openaiId(), object: "chat.completion", created: Math.floor(showcaseAt(5) / 1000), model: "gpt-4o",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "**Weather in Kraków**\n- Thursday: 2-9 °C, cloudy, light rain from mid-afternoon - bring an umbrella for the evening.\n- Friday: 3-11 °C, sunny intervals but windy.\n\n**Direct flights KRK → AMS on Friday evening**\n| Flight | Departs | Arrives | Price |\n|---|---|---|---|\n| KL1998 | 18:05 | 20:20 | €164 (4 seats left) |\n| LO269 | 20:40 | 22:55 | €121 |\n\nIf the conference wraps up by 16:30, KL1998 is doable (the airport is ~30 min from the centre). LO269 is cheaper and gives you more buffer. Want me to hold a seat on either?" } }],
        usage: { prompt_tokens: 486, completion_tokens: 172, total_tokens: 658, prompt_tokens_details: { cached_tokens: 0 } },
      },
      timestamp: showcaseAt(5),
      durationMs: 2870,
    });
    starred.push(id);
  }

  // 6. o3-mini: reasoning model - most of the output is hidden reasoning ──────
  await ingestOpenAI(ctx, {
    request: {
      model: "o3-mini",
      max_tokens: 8000,
      messages: [{ role: "user", content: "Our job queue retries failed jobs with `delay = base * 2^attempt` (base = 2s, max 8 attempts) and all workers restarted at the same moment after an outage, so ~40k jobs retried in lockstep and hammered the database again. What's the minimal change to the retry formula that prevents this, and roughly how long is the worst-case total wait after the change?" }],
    },
    response: {
      id: openaiId(), object: "chat.completion", created: Math.floor(showcaseAt(10) / 1000), model: "o3-mini",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "**Minimal change: add jitter.** Use \"full jitter\" instead of a fixed delay:\n\n```ts\nconst cap = base * 2 ** attempt;          // same exponential envelope as today\nconst delay = Math.random() * cap;          // full jitter: uniform in [0, cap)\n```\n\nThe exponential envelope is fine; the problem is that every job waiting on attempt *n* wakes up at exactly the same moment. Full jitter spreads each wave uniformly across the whole window, so 40k jobs on attempt 5 (cap 64 s) arrive at ~625 jobs/s instead of all at once.\n\n**Worst-case total wait** (attempts 0-7, base 2 s):\n- today: 2 + 4 + ... + 256 = **510 s** (8.5 min), every time;\n- with full jitter: the same **510 s** upper bound, but the *expected* total is half of that, **~255 s**.\n\nTwo cheap additions worth considering: cap a single delay (e.g. 5 min) so later attempts don't grow unbounded if you raise the attempt limit, and add jitter to worker *startup* too - the restart itself was the synchronising event." } }],
      usage: { prompt_tokens: 118, completion_tokens: 2614, total_tokens: 2732, completion_tokens_details: { reasoning_tokens: 2240 } },
    },
    timestamp: showcaseAt(10),
    durationMs: 14260,
  });

  // 7. GPT-4o vision: read a chart for a report ────────────────────────────────
  await ingestOpenAI(ctx, {
    request: {
      model: "gpt-4o",
      max_tokens: 700,
      messages: [
        { role: "system", content: "You help analysts write reports. Read charts precisely and point out anything a reviewer might question." },
        { role: "user", content: [
          { type: "text", text: "Summarise this chart in 3-4 sentences for a policy brief, and flag anything odd." },
          { type: "image_url", image_url: { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Line_Graph_GDP_and_Year.png/960px-Line_Graph_GDP_and_Year.png", detail: "high" } },
        ] },
      ],
    },
    response: {
      id: openaiId(), object: "chat.completion", created: Math.floor(showcaseAt(11) / 1000), model: "gpt-4o",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "**Summary:** India's public spending on education stayed between roughly 3.1% and 3.9% of GDP from 2003 to 2021. It fell from about 3.6% in 2003 to 3.1% in 2006, recovered to 3.3% in 2009 and peaked at about 3.9% in 2012, then declined steadily to about 3.1% by 2021 - back to its 2006 low.\n\n**Things a reviewer might question:**\n1. **Truncated y-axis** - it starts at 3%, which makes a 0.8-point swing look dramatic. Say so in the caption or start the axis at 0.\n2. **Sparse data** - points are only every three years, so the 2012 \"peak\" may be a single high year rather than a trend.\n3. **No source or definition** - it isn't clear whether this is central government only or central + state spending, which changes the numbers considerably for India." } }],
      usage: { prompt_tokens: 1158, completion_tokens: 206, total_tokens: 1364 },
    },
    timestamp: showcaseAt(11),
    durationMs: 4120,
  });

  // 8. Vercel AI SDK: streamText chat with a tool round-trip ────────────────────
  {
    const s = `call_${rid(20)}`;
    await ingestVercel(ctx, {
      type: "ai.streamText",
      operationId: vercelId(),
      model: "gpt-4o-mini",
      provider: "openai.chat",
      timestamp: showcaseAt(7),
      durationMs: 2340,
      input: {
        system: "You are the shopping assistant for Stride, an online running store. Recommend at most 3 products, always with price and why it fits.",
        temperature: 0.6,
        messages: [
          { role: "user", content: "I'm training for my first half marathon. Mostly road, about 30 km a week, and my knees get sore on long runs. Budget around €150." },
          { role: "assistant", content: [{ type: "tool-call", toolCallId: s, toolName: "searchProducts", args: { category: "road-running-shoes", cushioning: "max", maxPrice: 160, sort: "rating" } }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: s, toolName: "searchProducts", result: [
            { sku: "ST-NB-1080", name: "New Balance Fresh Foam X 1080v14", price: 159.95, rating: 4.7, drop_mm: 6 },
            { sku: "ST-AS-NIM", name: "ASICS Gel-Nimbus 27", price: 149.95, rating: 4.6, drop_mm: 8 },
            { sku: "ST-HK-CL", name: "HOKA Clifton 10", price: 139.95, rating: 4.5, drop_mm: 8 },
          ] }] },
        ],
      },
      output: {
        finishReason: "stop",
        text: "For 30 km a week with sore knees, prioritise cushioning over speed. Three good fits:\n\n1. **ASICS Gel-Nimbus 27 - €149.95.** Very soft and stable, the safest all-rounder for longer runs. Right on budget.\n2. **HOKA Clifton 10 - €139.95.** Lighter and a bit livelier, still well cushioned. Good if you'll also do some faster sessions.\n3. **New Balance Fresh Foam X 1080v14 - €159.95.** The plushest of the three; worth the extra €10 if your knees are the main concern.\n\nTip: buy them at least 4 weeks before race day so you can do two or three long runs in them first.",
      },
      usage: { promptTokens: 612, completionTokens: 168, totalTokens: 780 },
    });
  }

  // 9. Vercel AI SDK: generateObject classification ────────────────────────────
  await ingestVercel(ctx, {
    type: "ai.generateObject",
    operationId: vercelId(),
    model: "claude-haiku-4-5",
    provider: "anthropic.messages",
    timestamp: showcaseAt(13),
    durationMs: 860,
    input: {
      system: "Classify incoming support tickets. Respond with the JSON object only.",
      temperature: 0,
      prompt: "Subject: Exports broken since this morning??\n\nHi, every CSV export from the Reports page fails with 'Something went wrong' since about 9am. We need the monthly numbers for a board meeting at 3pm today. Account: acme-logistics. - Jonas",
    },
    output: {
      finishReason: "stop",
      text: JSON.stringify({ category: "bug", product_area: "reports/export", sentiment: "frustrated", urgency: "high", deadline: "today 15:00", needs_human: true, summary: "CSV exports from Reports fail since ~09:00; customer needs data for a board meeting at 15:00." }, null, 2),
    },
    usage: { promptTokens: 214, completionTokens: 92, totalTokens: 306 },
  });

  // 10. Hit max_tokens: the answer is cut off mid-sentence ─────────────────────
  await ingestVercel(ctx, {
    type: "ai.generateText",
    operationId: vercelId(),
    model: "gpt-4o",
    provider: "openai.chat",
    timestamp: showcaseAt(14),
    durationMs: 9480,
    input: {
      system: "You write the Northwind engineering blog. Clear, concrete, no hype.",
      maxTokens: 600,
      prompt: "Write a blog post (~1200 words) about how we cut our p95 API latency from 840 ms to 210 ms: connection pooling, N+1 query fixes, and moving PDF rendering to a queue.",
    },
    output: {
      finishReason: "length",
      text: "# How we cut p95 latency by 75% without rewriting anything\n\nThree months ago, our API's p95 latency was 840 ms. Customers didn't complain loudly, but our dashboards told a clear story: the slowest 5% of requests were getting slower every month, and they were concentrated in exactly the places customers care about - invoices, reports and exports.\n\nToday that number is 210 ms. We didn't rewrite a service or change languages. We fixed three boring things.\n\n## 1. Connection pooling: the 300 ms we were paying on every cold request\n\nOur Node services opened a fresh PostgreSQL connection for many requests. TLS handshake plus authentication cost us 40-60 ms on a good day and up to 300 ms under load, when the database was busy accepting new connections.\n\nWe moved to PgBouncer in transaction mode and capped each service at 20 pooled connections. Two things surprised us:\n\n- **Fewer connections made us faster.** Postgres spends real CPU on each connection; going from ~400 to 120 total connections reduced lock contention noticeably.\n- **Prepared statements needed care.** In transaction mode they don't survive between transactions, so we",
    },
    usage: { promptTokens: 96, completionTokens: 600, totalTokens: 696 },
  });

  // 11. Rate limited (429) ──────────────────────────────────────────────────────
  {
    const id = await insertErrorTrace(ctx, {
      provider: "anthropic",
      model: "claude-opus-4-8",
      timestamp: showcaseAt(12),
      durationMs: 412,
      statusCode: 429,
      error: "rate_limit_error: This request would exceed your organization's rate limit of 400,000 input tokens per minute (claude-opus-4-8). Please retry after 38 seconds.",
      systemPrompt: "You are a contract analyst. Identify unusual clauses and risks.",
      messages: [{ role: "user", content: "Review the attached master services agreement (84 pages) and list every clause that deviates from our standard terms, with a risk rating for each.\n\n[document: MSA_Globex_v7_final.pdf - 112,408 tokens]" }],
    });
    notes.push([id, "Burst of contract reviews from the batch job hit the Opus ITPM limit. Batch now goes through the queue with max 2 concurrent requests."]);
  }

  // 12. Context window exceeded (400) ───────────────────────────────────────────
  await insertErrorTrace(ctx, {
    provider: "openai",
    model: "gpt-4o",
    timestamp: showcaseAt(15),
    durationMs: 288,
    statusCode: 400,
    error: "context_length_exceeded: This model's maximum context length is 128000 tokens. However, your messages resulted in 141,203 tokens. Please reduce the length of the messages.",
    systemPrompt: "You are an SRE assistant. Find the root cause in the logs.",
    messages: [{ role: "user", content: "Here are the full logs from all 6 pods during the incident window (14:02-14:47 UTC). What caused the 502s?\n\n[pasted: 6 × kubectl logs, 9,814 lines]" }],
  });

  // 13. Same prompt on two models: Sonnet original + Haiku replay ──────────────
  {
    const transcript = `Product sync - transcript (excerpt)

Priya: OK, first thing - the CSV export bug. Jonas from Acme escalated again this morning.
Tom: It's the timezone handling in the date filter. I have a fix, it just needs review.
Priya: Can it go out today?
Tom: If Lena reviews it after lunch, yes.
Lena: I can do 1pm.
Priya: Great. Second - the pricing page experiment. Results?
Sam: Variant B with annual pricing first: 18% more annual sign-ups, monthly basically flat. It's significant, n is about 4,200 per variant.
Priya: Then let's ship B to everyone. Sam, can you also write it up for the Thursday all-hands?
Sam: Sure.
Priya: Last thing, onboarding emails. Lena, you wanted to cut the sequence?
Lena: From 7 emails to 4. Open rates drop off a cliff after the fourth one anyway. I'd like a decision by Friday so marketing can update the automation.
Priya: Let's take it async - post the proposal in #growth and we decide there by Friday.`;
    const system = "You turn meeting transcripts into notes: decisions, action items (owner + due date) and open questions. Nothing else.";
    const original: AnthropicRawLog = {
      request: { model: "claude-sonnet-4-6", max_tokens: 800, temperature: 0.2, system, messages: [{ role: "user", content: transcript }] },
      response: {
        id: anthropicId(), type: "message", role: "assistant", model: "claude-sonnet-4-6",
        stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: "## Decisions\n- Ship pricing page **variant B** (annual pricing first) to all visitors: +18% annual sign-ups, monthly flat, ~4,200 users per variant.\n\n## Action items\n| Owner | Action | Due |\n|---|---|---|\n| Lena | Review Tom's CSV export fix (date filter timezone) | Today, 13:00 |\n| Tom | Deploy the CSV export fix after review; let Jonas (Acme) know | Today |\n| Sam | Roll out variant B to 100% | - |\n| Sam | Write up the pricing experiment for the all-hands | Thursday |\n| Lena | Post the onboarding email proposal (7 → 4 emails) in #growth | Before Friday |\n\n## Open questions\n- Cut the onboarding sequence from 7 to 4 emails? To be decided async in #growth **by Friday** so marketing can update the automation." }],
        usage: { input_tokens: 412, output_tokens: 226 },
      },
      timestamp: showcaseAt(4),
      durationMs: 5240,
    };
    const originalId = await ingestAnthropic(ctx, original);

    const replay = parseAnthropicLog({
      request: { ...original.request, model: "claude-haiku-4-5" },
      response: {
        id: anthropicId(), type: "message", role: "assistant", model: "claude-haiku-4-5",
        stop_reason: "end_turn", stop_sequence: null,
        content: [{ type: "text", text: "## Decisions\n- Roll out pricing variant B (annual first) to everyone - +18% annual sign-ups.\n\n## Action items\n- **Lena** - review CSV export fix, today 13:00\n- **Tom** - ship CSV export fix today\n- **Sam** - ship variant B; write-up for Thursday all-hands\n- **Lena** - post onboarding email proposal in #growth\n\n## Open questions\n- Reduce onboarding emails from 7 to 4? Decide in #growth by Friday." }],
        usage: { input_tokens: 412, output_tokens: 131 },
      },
      timestamp: showcaseAt(3),
      durationMs: 1390,
    });
    if (replay.success) {
      await ctx.insertTrace(replay.trace, originalId);
      notes.push([replay.trace.id, "Replayed on Haiku: same decisions and owners, but it dropped \"let Jonas know\" and the due dates are less explicit. ~17× cheaper and ~4× faster - good enough for internal syncs, keep Sonnet for customer meetings."]);
      starred.push(originalId);
    }
  }

  // 14. Prompt A/B: same input, two system prompt versions (use Diff) ──────────
  {
    const input = "Write the release announcement for v2.4: scheduled exports (daily/weekly to S3 or email), 40% faster dashboard loading, and SSO with Okta for the Business plan.";
    await ingestOpenAI(ctx, {
      request: { model: "gpt-4o-mini", temperature: 0.7, max_tokens: 400, messages: [
        { role: "system", content: "Write product announcements for our changelog." },
        { role: "user", content: input },
      ] },
      response: {
        id: openaiId(), object: "chat.completion", created: Math.floor(showcaseAt(9) / 1000), model: "gpt-4o-mini",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "🚀 Exciting news! Version 2.4 is here and it's our biggest release yet!\n\nWe've been working incredibly hard to bring you some amazing new features that will totally transform the way you work with your data!\n\n✨ **Scheduled Exports** - Now you can automatically export your reports daily or weekly straight to S3 or your inbox! No more manual exports!\n\n⚡ **Lightning-Fast Dashboards** - Dashboards now load a whopping 40% faster!\n\n🔐 **Okta SSO** - Business plan customers can now log in with Okta for enterprise-grade security!\n\nWe can't wait for you to try it out! Let us know what you think! 🎉" } }],
        usage: { prompt_tokens: 58, completion_tokens: 156, total_tokens: 214 },
      },
      timestamp: showcaseAt(9),
      durationMs: 1910,
    });
    const v2 = await ingestOpenAI(ctx, {
      request: { model: "gpt-4o-mini", temperature: 0.7, max_tokens: 400, messages: [
        { role: "system", content: "Write product announcements for our changelog. Audience: data engineers. Lead with what changed and why it matters. Max 120 words, no emoji, no exclamation marks, no superlatives." },
        { role: "user", content: input },
      ] },
      response: {
        id: openaiId(), object: "chat.completion", created: Math.floor(showcaseAt(8) / 1000), model: "gpt-4o-mini",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "## v2.4: scheduled exports, faster dashboards, Okta SSO\n\n**Scheduled exports.** Any report can now be exported daily or weekly to an S3 bucket or by email. Set it up once under *Report → Export → Schedule*; failed deliveries are retried and show up in the audit log.\n\n**Faster dashboards.** Dashboards load about 40% faster on average, thanks to query batching and caching of unchanged widgets. Large dashboards benefit most.\n\n**Okta SSO (Business plan).** Admins can connect Okta under *Settings → Security*. SCIM provisioning follows in v2.5." } }],
        usage: { prompt_tokens: 84, completion_tokens: 128, total_tokens: 212 },
      },
      timestamp: showcaseAt(8),
      durationMs: 1650,
    });
    starred.push(v2);
    notes.push([v2, "Prompt v2: audience + word limit + no emoji. Compare with the v1 trace just below it using Diff - v2 is what we ship."]);
  }

  // 15. Quick multi-turn chat - a fast, cheap call ─────────────────────────────
  await ingestOpenAI(ctx, {
    request: { model: "gpt-4o-mini", temperature: 0.2, max_tokens: 300, messages: [
      { role: "system", content: "You are a concise SQL helper for PostgreSQL." },
      { role: "user", content: "How do I get the latest order per customer?" },
      { role: "assistant", content: "Use `DISTINCT ON`:\n\n```sql\nSELECT DISTINCT ON (customer_id) *\nFROM orders\nORDER BY customer_id, created_at DESC;\n```" },
      { role: "user", content: "And only customers whose latest order is older than 90 days?" },
    ] },
    response: {
      id: openaiId(), object: "chat.completion", created: Math.floor(showcaseAt(16) / 1000), model: "gpt-4o-mini",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Wrap it in a CTE and filter:\n\n```sql\nWITH latest AS (\n  SELECT DISTINCT ON (customer_id) customer_id, created_at\n  FROM orders\n  ORDER BY customer_id, created_at DESC\n)\nSELECT customer_id, created_at AS last_order_at\nFROM latest\nWHERE created_at < now() - interval '90 days';\n```\n\nAn index on `orders (customer_id, created_at DESC)` keeps this fast." } }],
      usage: { prompt_tokens: 104, completion_tokens: 98, total_tokens: 202 },
    },
    timestamp: showcaseAt(16),
    durationMs: 640,
  });

  return { starred, notes };
}

// ── background traffic ────────────────────────────────────────────────────────
// Lighter variants of the same product scenarios, spread over 30 days so the
// dashboard charts (volume, cost, latency, errors, models) have realistic shape.

const SUPPORT_CASES = [
  { q: "Can I add 5 more seats to our plan mid-cycle?", a: "Yes - extra seats are prorated for the rest of this billing period. I've checked your account: adding 5 seats today costs $122.50 now, then $49/seat/month from your next invoice. Want me to add them?" },
  { q: "Where can I download last month's invoice?", a: "Go to Settings → Billing → Invoices; every invoice has a PDF download. I can also resend it by e-mail - just say which address." },
  { q: "We want to downgrade from Business to Pro. Do we lose our data?", a: "No data is deleted. The downgrade takes effect at the end of your current period. You'll lose SSO and audit logs, and reports older than 12 months become read-only." },
  { q: "Our card was declined but the payment is fine on our side.", a: "I can see two declined attempts from your bank with code `do_not_honor` - that's the bank blocking it, often for foreign transactions. Please ask them to allow payments to Northwind Cloud; I've paused the suspension for 7 days." },
  { q: "How do I get a VAT invoice with our company number?", a: "Add your VAT ID under Settings → Billing → Tax details. Future invoices include it automatically, and I've regenerated your last invoice with the VAT ID." },
  { q: "Can you cancel our trial? We went with another tool.", a: "Done - your trial is cancelled and no card will be charged. Your workspace stays readable for 30 days in case you want to export anything." },
];

const HANDBOOK_QUESTIONS = [
  { q: "How much is the learning budget and does it roll over?", a: "EUR 1,500 per year for courses, conferences and books, and unused budget does not roll over [6]. Conference travel counts against it [6]." },
  { q: "Can I fly premium economy to the Austin conference?", a: "Only if the flight is longer than 8 hours [7]. Amsterdam-Austin usually is, so premium economy is allowed. Remember the travel also counts against your learning budget [6]." },
  { q: "My monitor broke - can I expense a new one?", a: "Yes. Monitors, chairs and desks can be expensed once every 4 years, up to EUR 900 in total [4]." },
  { q: "How long is parental leave for non-birthing parents?", a: "12 weeks fully paid, which you can split into up to three blocks within 18 months of the birth or adoption [5]." },
  { q: "Can I work from Belgrade for two weeks?", a: "Serbia isn't on the restricted list [2], so yes - notify your manager and People Ops at least 14 days ahead [1]." },
];

const TICKETS = [
  "Login with Google keeps redirecting me back to the login page.",
  "Is there an API endpoint to bulk-delete old reports?",
  "Your dashboard shows yesterday's revenue as $0, which is definitely wrong.",
  "Love the new export feature, thanks team!",
  "We need a DPA signed before we can roll out to the EU team.",
  "Charts render blank in Safari 17 since the last update.",
];

const CODE_QUESTIONS = [
  { q: "Why does this React effect run twice in development?", a: "React 18 Strict Mode mounts, unmounts and remounts components in development to surface effects without proper cleanup. It doesn't happen in production builds. Return a cleanup function (abort the fetch, unsubscribe) and the double run becomes harmless." },
  { q: "Is `Promise.all` or `Promise.allSettled` better for loading 5 independent widgets?", a: "`Promise.allSettled` - with `Promise.all` one failing widget rejects the whole batch and the other four never render. With `allSettled` you render what succeeded and show an error state for the rest." },
  { q: "How do I make this Postgres query use the index on `created_at`?", a: "The `date(created_at) = ...` call prevents index use. Rewrite it as a range: `created_at >= '2026-10-01' AND created_at < '2026-10-02'`. Then the B-tree index on `created_at` applies." },
  { q: "What's the difference between `interface` and `type` in TypeScript here?", a: "For object shapes they're nearly interchangeable. Use `interface` when you want declaration merging or `extends` chains, and `type` for unions, mapped and conditional types. Pick one convention per codebase." },
];

const SUMMARIES = [
  "Summarise this week's customer feedback from the #feedback channel into themes.",
  "Summarise the incident report for INC-2291 for the status page.",
  "Turn these release notes into a 3-bullet summary for sales.",
  "Summarise the competitor's pricing page changes since last quarter.",
];

const ERRORS = [
  { statusCode: 429, error: "rate_limit_error: Number of request tokens has exceeded your per-minute rate limit." },
  { statusCode: 529, error: "overloaded_error: Overloaded" },
  { statusCode: 500, error: "api_error: Internal server error" },
  { statusCode: 504, error: "Request timed out after 60000 ms" },
];

async function seedBackgroundTrace(ctx: DemoSeedContext, timestamp: number): Promise<void> {
  // ~3% of calls fail, like a real production workload
  if (Math.random() < 0.03) {
    const e = pick(ERRORS);
    const anthropic = Math.random() < 0.6;
    await insertErrorTrace(ctx, {
      provider: anthropic ? "anthropic" : "openai",
      model: anthropic ? pick(["claude-sonnet-4-6", "claude-haiku-4-5"]) : "gpt-4o",
      timestamp,
      durationMs: e.statusCode === 504 ? 60000 : randInt(180, 900),
      statusCode: e.statusCode,
      error: e.error,
      messages: [{ role: "user", content: pick(SUPPORT_CASES).q }],
    });
    return;
  }

  const kind = pick(["support", "support", "handbook", "handbook", "ticket", "ticket", "code", "summary"] as const);
  switch (kind) {
    case "support": {
      const c = pick(SUPPORT_CASES);
      const model = Math.random() < 0.7 ? "claude-sonnet-4-6" : "claude-haiku-4-5";
      const t = toolId();
      await ingestAnthropic(ctx, {
        request: {
          model, max_tokens: 1024, temperature: 0.3,
          system: [{ type: "text", text: SUPPORT_SYSTEM, cache_control: { type: "ephemeral" } }],
          tools: SUPPORT_TOOLS,
          messages: [
            { role: "user", content: c.q },
            { role: "assistant", content: [{ type: "tool_use", id: t, name: "lookup_customer", input: { email: `${pick(["ops", "finance", "it", "admin"])}@${pick(["acme-logistics", "globex", "initech", "umbrella-labs", "hooli"])}.com` } }] },
            { role: "user", content: [{ type: "tool_result", tool_use_id: t, content: JSON.stringify({ customer_id: `cus_${rid(8)}`, plan: pick(["pro_monthly", "business_annual", "trial"]), seats: randInt(3, 60), status: "active" }) }] },
          ],
        },
        response: {
          id: anthropicId(), type: "message", role: "assistant", model, stop_reason: "end_turn", stop_sequence: null,
          content: [{ type: "text", text: c.a }],
          usage: { input_tokens: randInt(380, 720), output_tokens: randInt(60, 180), cache_read_input_tokens: 1310, cache_creation_input_tokens: 0 },
        },
        timestamp,
        durationMs: model === "claude-haiku-4-5" ? randInt(700, 1600) : randInt(1500, 4200),
      });
      return;
    }
    case "handbook": {
      const h = pick(HANDBOOK_QUESTIONS);
      const cold = Math.random() < 0.15; // first question after the 5-min cache expired
      await ingestAnthropic(ctx, {
        request: {
          model: "claude-haiku-4-5", max_tokens: 600, temperature: 0,
          system: [{ type: "text", text: HANDBOOK_SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: h.q }],
        },
        response: {
          id: anthropicId(), type: "message", role: "assistant", model: "claude-haiku-4-5", stop_reason: "end_turn", stop_sequence: null,
          content: [{ type: "text", text: h.a }],
          usage: cold
            ? { input_tokens: randInt(40, 70), output_tokens: randInt(40, 110), cache_read_input_tokens: 0, cache_creation_input_tokens: 1138 }
            : { input_tokens: randInt(40, 70), output_tokens: randInt(40, 110), cache_read_input_tokens: 1138, cache_creation_input_tokens: 0 },
        },
        timestamp,
        durationMs: cold ? randInt(1200, 2100) : randInt(450, 1100),
      });
      return;
    }
    case "ticket": {
      const text = pick(TICKETS);
      await ingestOpenAI(ctx, {
        request: { model: "gpt-4o-mini", temperature: 0, max_tokens: 200, messages: [
          { role: "system", content: "Classify the support ticket. Reply with JSON: {category, urgency, sentiment}." },
          { role: "user", content: text },
        ] },
        response: {
          id: openaiId(), object: "chat.completion", created: Math.floor(timestamp / 1000), model: "gpt-4o-mini",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({
            category: text.includes("DPA") ? "legal" : text.includes("API") ? "question" : text.includes("Love") ? "feedback" : "bug",
            urgency: text.includes("wrong") || text.includes("redirect") ? "high" : "normal",
            sentiment: text.includes("Love") ? "positive" : text.includes("wrong") ? "negative" : "neutral",
          }) } }],
          usage: tokens(randInt(55, 90), randInt(18, 30)),
        },
        timestamp,
        durationMs: randInt(280, 900),
      });
      return;
    }
    case "code": {
      const c = pick(CODE_QUESTIONS);
      await ingestAnthropic(ctx, {
        request: { model: "claude-sonnet-4-6", max_tokens: 1024, system: "You are a senior engineer helping teammates. Be direct; show code when it helps.", messages: [{ role: "user", content: c.q }] },
        response: {
          id: anthropicId(), type: "message", role: "assistant", model: "claude-sonnet-4-6", stop_reason: "end_turn", stop_sequence: null,
          content: [{ type: "text", text: c.a }],
          usage: { input_tokens: randInt(40, 120), output_tokens: randInt(90, 260) },
        },
        timestamp,
        durationMs: randInt(1800, 5200),
      });
      return;
    }
    case "summary": {
      const prompt = pick(SUMMARIES);
      const slow = Math.random() < 0.1;
      await ingestVercel(ctx, {
        type: "ai.streamText", operationId: vercelId(), model: "gpt-4o-mini", provider: "openai.chat",
        timestamp, durationMs: slow ? randInt(6000, 11000) : randInt(1100, 3200),
        input: { system: "Summarise for busy readers: short bullets, concrete numbers, no filler.", prompt: `${prompt}\n\n[${randInt(1, 9)},${randInt(100, 999)} words of source text]` },
        output: { finishReason: "stop", text: "- Main theme: reporting speed - 4 of 9 customers mentioned slow exports.\n- Most requested: scheduled exports to S3 (shipping in v2.4).\n- One churn risk: Initech, waiting on Okta SSO." },
        usage: vercelTokens(randInt(900, 3200), randInt(60, 160)),
      });
      return;
    }
  }
}

async function seedBackground(ctx: DemoSeedContext): Promise<void> {
  // 29 days of history; weekdays busier than weekends, slight growth towards today
  for (let d = 29; d >= 1; d--) {
    const day = new Date(ago(d * DAY));
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const perDay = weekend ? randInt(1, 3) : randInt(3, 5) + Math.round((29 - d) / 12);
    for (let i = 0; i < perDay; i++) {
      await seedBackgroundTrace(ctx, ago(d * DAY + randInt(0, 23 * HOUR)));
    }
  }
  // last 24 hours, hour by hour, for the 24h dashboard view - stops 4 hours ago,
  // where the showcase traces take over (see showcaseAt)
  for (let h = 23; h >= 4; h--) {
    const perHour = h >= 4 && h <= 9 ? randInt(0, 1) : randInt(1, 3);
    for (let i = 0; i < perHour; i++) {
      await seedBackgroundTrace(ctx, ago(h * HOUR + randInt(1, 59) * MIN));
    }
  }
}

// ── entry point ───────────────────────────────────────────────────────────────

// Fills an empty demo account: showcase traces (stars + notes), background traffic
// and API keys. Org name/retention are set directly in the DB by ensureDemoAccount
// (PATCH /orgs/me is blocked for the demo account).
export async function seedDemoData(ctx: DemoSeedContext): Promise<void> {
  const { starred, notes } = await seedShowcase(ctx);
  await seedBackground(ctx);

  for (const id of starred) await ctx.api("PATCH", `/traces/${id}`, { starred: true });
  for (const [id, body] of notes) await ctx.api("POST", `/traces/${id}/notes`, { body });

  // A re-seed keeps the account's existing keys.
  const keys = (await ctx.api("GET", "/keys")) as unknown[];
  if (keys.length === 0) {
    await ctx.api("POST", "/keys", { name: "production", env: "production", scopes: ["read", "write"] });
    await ctx.api("POST", "/keys", { name: "staging", env: "staging", scopes: ["read", "write"] });
    await ctx.api("POST", "/keys", { name: "ci", env: "ci", scopes: ["read"] });
  }
}
