// Hand-written showcase traces: the first page of the demo's trace list. Each one is a
// full multi-step run (tool calls, results, final answer) chosen to show a different
// part of LLM Lens. They fill the last ~3 hours, newest = most impressive.

import {
  type AgentScript, type DemoSeedContext,
  MIN, DAY, ago, isoDate,
  anthropicLog, openaiLog, vercelLog, ingest, insertFailed, insertReplay, upToTurn,
} from "./agent";
import {
  SUPPORT_SYSTEM, SUPPORT_TOOLS, CODING_SYSTEM, CODING_TOOLS, HANDBOOK_SYSTEM, HANDBOOK_TOOLS,
  SRE_SYSTEM, SRE_TOOLS, TRAVEL_SYSTEM, TRAVEL_TOOLS, ANALYST_SYSTEM, ANALYST_TOOLS,
} from "./scenarios";

const at = (rank: number): number => ago(3 * MIN + rank * 11 * MIN);

const RECEIPT_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Sahan_Supermarket_receipt%2C_Hillegersberg%2C_Rotterdam_%282021%29_02.jpg/960px-Sahan_Supermarket_receipt%2C_Hillegersberg%2C_Rotterdam_%282021%29_02.jpg";
const CHART_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Line_Graph_GDP_and_Year.png/960px-Line_Graph_GDP_and_Year.png";

export interface Showcase {
  starred: string[];
  notes: Array<[string, string]>;
}

export async function seedShowcase(ctx: DemoSeedContext): Promise<Showcase> {
  const starred: string[] = [];
  const notes: Array<[string, string]> = [];

  // 1. Support agent: verify → confirm → refund → explain ──────────────────────
  const support: AgentScript = {
    user: "Hi, I was charged twice for our Pro plan this month (order A-20931). Can you sort this out? It's maya.chen@northwind-retail.com",
    turns: [
      { say: "Sorry about that, Maya - let me pull up your account first.", calls: [{ name: "lookup_customer", input: { email: "maya.chen@northwind-retail.com" }, result: { customer_id: "cus_R8fK2mQx", name: "Maya Chen", company: "Northwind Retail", plan: "pro_monthly", seats: 12, status: "active", since: "2024-03-14" } }] },
      { calls: [{ name: "list_charges", input: { customer_id: "cus_R8fK2mQx", since: isoDate(ago(30 * DAY)) }, result: [
        { charge_id: "ch_3QxT81Lk", amount_cents: 58800, currency: "usd", created: `${isoDate(ago(9 * DAY))}T08:14:02Z`, description: "Pro plan - 12 seats", status: "succeeded" },
        { charge_id: "ch_3QxT7zPa", amount_cents: 58800, currency: "usd", created: `${isoDate(ago(9 * DAY))}T08:13:57Z`, description: "Pro plan - 12 seats", status: "succeeded" },
      ] }] },
      { say: "Confirmed: two identical charges of $588.00, five seconds apart. That's above my $500 limit for a normal refund, but our policy lets me refund duplicates immediately, so I'm refunding the second one now.", calls: [{ name: "issue_refund", input: { charge_id: "ch_3QxT81Lk", amount_cents: 58800, reason: "duplicate" }, result: { refund_id: "re_9LmN4tYw", status: "succeeded", amount_cents: 58800, expected_arrival: "5-10 business days" } }] },
    ],
    final: "All sorted, Maya. Here's what happened and what I did:\n\n**What went wrong:** your card was charged $588.00 twice for the Pro plan (12 seats), five seconds apart. That's a duplicate on our side - most likely a retried payment request.\n\n**What I did:** refunded the duplicate charge (`ch_3QxT81Lk`) in full. Refund reference: **re_9LmN4tYw**.\n\n**When you'll see it:** usually 5-10 business days, depending on your bank. Your Pro subscription is untouched - all 12 seats stay active.\n\nIf the refund hasn't shown up after 10 business days, reply to this thread with the reference above and I'll chase it with our payment provider. Anything else I can help with?",
  };
  {
    const id = await ingest(ctx, { provider: "anthropic", log: anthropicLog(support, { model: "claude-sonnet-4-6", system: SUPPORT_SYSTEM, tools: SUPPORT_TOOLS, cached: true, temperature: 0.3, maxTokens: 1024, timestamp: at(0), durationMs: 3920 }) });
    starred.push(id);
    notes.push([id, "Golden path for the duplicate-charge flow: verify → confirm → refund → explain. The agent correctly applied the duplicate exception to the $500 refund limit. Use this as an eval fixture."]);
  }

  // 2. Coding agent: reproduce with a failing test, fix, green run ──────────────
  {
    const original = "export async function getInvoice(req: Request, res: Response) {\n  const invoice = await db.invoices.findById(req.params.id);\n  if (!invoice) return res.status(404).json({ error: \"Not found\" });\n\n  const customer = await db.customers.findById(invoice.customerId);\n  const taxRate = TAX_RATES[customer.billingAddress.country] ?? 0;\n\n  return res.json({\n    ...invoice,\n    tax: Math.round(invoice.subtotal * taxRate),\n    total: Math.round(invoice.subtotal * (1 + taxRate)),\n  });\n}";
    const fixed = "export async function getInvoice(req: Request, res: Response) {\n  const invoice = await db.invoices.findById(req.params.id);\n  if (!invoice) return res.status(404).json({ error: \"Not found\" });\n\n  const customer = await db.customers.findById(invoice.customerId);\n  // Customers created through the API may not have a billing address yet.\n  const country = customer?.billingAddress?.country;\n  const taxRate = country ? (TAX_RATES[country] ?? 0) : 0;\n\n  return res.json({\n    ...invoice,\n    tax: Math.round(invoice.subtotal * taxRate),\n    total: Math.round(invoice.subtotal * (1 + taxRate)),\n    taxEstimated: !country,\n  });\n}";
    const id = await ingest(ctx, { provider: "anthropic", log: anthropicLog({
      user: "GET /invoices/:id returns a 500 for customers that don't have a billing address yet (Sentry BILLING-3F2). Fix it and make sure the invoice tests pass.",
      turns: [
        { say: "I'll start by reading the route handler.", calls: [{ name: "read_file", input: { path: "src/routes/invoices.ts" }, result: original }] },
        { say: "`customer.billingAddress.country` will throw when `billingAddress` is null. Let me reproduce it with the existing tests first.", calls: [{ name: "run_tests", input: { pattern: "invoices" }, isError: true, result: " FAIL  src/routes/invoices.test.ts > GET /invoices/:id > returns an invoice for a customer without billing address\nTypeError: Cannot read properties of null (reading 'country')\n ❯ getInvoice src/routes/invoices.ts:6:52\n\n Test Files  1 failed (1)\n      Tests  1 failed | 11 passed (12)\n   Duration  1.84s" }] },
        { say: "Reproduced. I'll guard the lookup, fall back to a zero tax rate, and flag the response so the UI can show the tax as an estimate.", calls: [{ name: "write_file", input: { path: "src/routes/invoices.ts", content: fixed }, result: "Wrote 612 bytes to src/routes/invoices.ts" }] },
        { calls: [{ name: "run_tests", input: { pattern: "invoices" }, result: " ✓ src/routes/invoices.test.ts (12 tests) 412ms\n\n Test Files  1 passed (1)\n      Tests  12 passed (12)\n   Duration  1.61s" }] },
      ],
      final: "Fixed - all 12 invoice tests pass.\n\n**Root cause:** customers created through the public API can exist without a billing address. `getInvoice` read `customer.billingAddress.country` unconditionally, so those invoices threw a `TypeError` and the route returned 500.\n\n**Fix** (`src/routes/invoices.ts`):\n- read the country with optional chaining and fall back to a 0% tax rate when it's missing;\n- add `taxEstimated: true` to the response in that case, so the dashboard can label the tax as an estimate instead of silently showing $0.\n\n**Worth a follow-up:** the invoice should probably not be finalised at all without a billing address - tax is legally required in several of our markets. I'd suggest blocking `POST /invoices/:id/finalize` until the address is set; happy to do that in a separate change.",
    }, { model: "claude-opus-4-8", system: CODING_SYSTEM, tools: CODING_TOOLS, cached: true, maxTokens: 4096, timestamp: at(1), durationMs: 18740 }) });
    starred.push(id);
    notes.push([id, "Nice example of the agent using the failing test as a reproduction before editing. Follow-up suggested at the end (block finalize without address) → created BILL-412."]);
  }

  // 3. Vision: receipt photo → expense, with a policy check ─────────────────────
  {
    const id = await ingest(ctx, { provider: "anthropic", log: anthropicLog({
      user: [
        { type: "image", url: RECEIPT_URL, mediaType: "image/jpeg" },
        { type: "text", text: "Add this to my expense report for the Rotterdam offsite - snacks for the workshop." },
      ],
      turns: [
        { say: "Reading the receipt and creating the expense.", calls: [{ name: "record_expense", input: {
          merchant: "SAHAN Supermarkt", address: "Bergweg 170, 3036 BL Rotterdam", date: "2021-01-26", time: "11:29",
          receipt_number: "2-00005155", currency: "EUR",
          items: [
            { description: "Miras olive oil (glass) 1L", quantity: 1, amount: 3.99 },
            { description: "Meray Trakya pumpkin seeds 200g", quantity: 1, amount: 1.99 },
            { description: "Pinar pumpkin seeds 200g", quantity: 1, amount: 1.99 },
            { description: "Ülker Petibör biscuits 1kg", quantity: 1, amount: 2.49 },
            { description: "Simit bread (5 × 0.75)", quantity: 5, amount: 3.75 },
          ],
          total: 14.21, vat: 1.17, payment_method: "PIN (debit card)",
        }, result: { expense_id: "exp_77Q41", status: "draft" } }] },
        { calls: [{ name: "check_expense_policy", input: { expense_id: "exp_77Q41", category: "team_food" }, result: { ok: false, issues: [
          { code: "receipt_too_old", message: "Receipt is older than 90 days - needs manager approval." },
          { code: "attendees_missing", message: "Team food needs the number of attendees." },
        ] } }] },
        { say: "The policy check found two issues. I'll still attach it to the report as a draft so nothing gets lost.", calls: [{ name: "attach_to_report", input: { expense_id: "exp_77Q41", report: "Rotterdam offsite", note: "Workshop snacks" }, result: { report_id: "rep_2208", report_total_eur: 486.4, needs_approval: true } }] },
      ],
      final: "Added to **Rotterdam offsite** as a draft - EUR 14.21 at SAHAN Supermarkt (5 items, VAT EUR 1.17, paid by debit card).\n\nTwo things before you can submit it:\n1. **The receipt is from 26 January 2021.** Receipts older than 90 days need your manager's approval - if this is the wrong photo, send me the right one and I'll replace it.\n2. **How many people attended?** Team food expenses need the number of attendees.\n\nReply with the attendee count and I'll finish the expense.",
    }, { model: "claude-sonnet-4-6", system: "You turn photos of receipts into expense records. Copy amounts exactly as printed; never guess missing values. Run the policy check before attaching an expense to a report.", tools: [
      { name: "record_expense", description: "Create a draft expense from receipt data.", parameters: { type: "object", properties: { merchant: { type: "string" }, date: { type: "string" }, currency: { type: "string" }, items: { type: "array" }, total: { type: "number" } }, required: ["merchant", "date", "currency", "items", "total"] } },
      { name: "check_expense_policy", description: "Validate an expense against the travel & expense policy.", parameters: { type: "object", properties: { expense_id: { type: "string" }, category: { type: "string" } }, required: ["expense_id"] } },
      { name: "attach_to_report", description: "Attach an expense to an expense report.", parameters: { type: "object", properties: { expense_id: { type: "string" }, report: { type: "string" }, note: { type: "string" } }, required: ["expense_id", "report"] } },
    ], temperature: 0, timestamp: at(2), durationMs: 6420 }) });
    starred.push(id);
    notes.push([id, "Vision + policy check caught a 2021 receipt being filed for this year's offsite. Good candidate for a 'stale receipt' eval case."]);
  }

  // 4-5. Meeting assistant on Sonnet, then replayed on Haiku ────────────────────
  {
    const transcript = "Product sync - transcript (excerpt)\n\nPriya: OK, first thing - the CSV export bug. Jonas from Acme escalated again this morning.\nTom: It's the timezone handling in the date filter. I have a fix, it just needs review.\nPriya: Can it go out today?\nTom: If Lena reviews it after lunch, yes.\nLena: I can do 1pm.\nPriya: Great. Second - the pricing page experiment. Results?\nSam: Variant B with annual pricing first: 18% more annual sign-ups, monthly basically flat. It's significant, n is about 4,200 per variant.\nPriya: Then let's ship B to everyone. Sam, can you also write it up for the Thursday all-hands?\nSam: Sure.\nPriya: Last thing, onboarding emails. Lena, you wanted to cut the sequence?\nLena: From 7 emails to 4. Open rates drop off a cliff after the fourth one anyway. I'd like a decision by Friday so marketing can update the automation.\nPriya: Let's take it async - post the proposal in #growth and we decide there by Friday.";
    const meeting = (final: string): AgentScript => ({
      user: transcript,
      turns: [
        { say: "Creating the action items in Linear.", calls: [
          { name: "create_task", input: { title: "Review CSV export timezone fix", assignee: "Lena", due: "today 13:00" }, result: { id: "PRD-881", url: "https://linear.app/northwind/issue/PRD-881" } },
          { name: "create_task", input: { title: "Ship pricing variant B to 100% + all-hands write-up", assignee: "Sam", due: "Thursday" }, result: { id: "PRD-882", url: "https://linear.app/northwind/issue/PRD-882" } },
          { name: "create_task", input: { title: "Post onboarding email proposal (7 → 4) in #growth", assignee: "Lena", due: "Friday" }, result: { id: "PRD-883", url: "https://linear.app/northwind/issue/PRD-883" } },
        ] },
        { calls: [{ name: "post_to_slack", input: { channel: "#product-sync", text: "Notes + action items from today's sync: PRD-881, PRD-882, PRD-883" }, result: { ok: true, ts: "1730203391.004100" } }] },
      ],
      final,
    });
    const tools = [
      { name: "create_task", description: "Create a Linear issue.", parameters: { type: "object", properties: { title: { type: "string" }, assignee: { type: "string" }, due: { type: "string" } }, required: ["title"] } },
      { name: "post_to_slack", description: "Post a message to a Slack channel.", parameters: { type: "object", properties: { channel: { type: "string" }, text: { type: "string" } }, required: ["channel", "text"] } },
    ];
    const system = "You turn meeting transcripts into notes: decisions, action items (owner + due date, created as Linear issues) and open questions. Post a short summary to the team channel. Nothing else.";
    const originalId = await ingest(ctx, { provider: "anthropic", log: anthropicLog(meeting("## Decisions\n- Ship pricing page **variant B** (annual pricing first) to all visitors: +18% annual sign-ups, monthly flat, ~4,200 users per variant.\n\n## Action items\n| Owner | Action | Due | Issue |\n|---|---|---|---|\n| Lena | Review Tom's CSV export fix (date filter timezone) | Today, 13:00 | PRD-881 |\n| Tom | Deploy the fix after review; let Jonas (Acme) know | Today | - |\n| Sam | Roll out variant B + write-up for the all-hands | Thursday | PRD-882 |\n| Lena | Post the onboarding email proposal (7 → 4) in #growth | Friday | PRD-883 |\n\n## Open questions\n- Cut the onboarding sequence from 7 to 4 emails? To be decided async in #growth **by Friday** so marketing can update the automation.\n\nSummary posted to #product-sync."), { model: "claude-sonnet-4-6", system, tools, temperature: 0.2, timestamp: at(4), durationMs: 7240 }) });
    const replayId = await insertReplay(ctx, { provider: "anthropic", log: anthropicLog(meeting("## Decisions\n- Roll out pricing variant B (annual first) to everyone - +18% annual sign-ups.\n\n## Action items\n- **Lena** - review CSV export fix, today 13:00 (PRD-881)\n- **Sam** - variant B rollout + all-hands write-up, Thursday (PRD-882)\n- **Lena** - onboarding email proposal in #growth, Friday (PRD-883)\n\n## Open questions\n- Reduce onboarding emails from 7 to 4? Decide in #growth by Friday."), { model: "claude-haiku-4-5", system, tools, temperature: 0.2, timestamp: at(3), durationMs: 1960 }) }, originalId);
    starred.push(originalId);
    notes.push([replayId, "Replayed on Haiku: same decisions, owners and issue links, but it dropped Tom's \"deploy + let Jonas know\" (no issue was created for it). Much cheaper and ~4× faster - fine for internal syncs, keep Sonnet for customer meetings."]);
  }

  // 6. Travel assistant: parallel tool calls, then a hold ──────────────────────
  {
    const id = await ingest(ctx, { provider: "openai", log: openaiLog({
      user: "I'm at a conference in Kraków on Thursday and Friday. What's the weather going to be like, and can you hold the cheaper direct flight back to Amsterdam on Friday evening? I can't leave the venue before 17:30.",
      turns: [
        { calls: [
          { name: "get_weather", input: { city: "Kraków", days: 2 }, result: [{ day: "Thursday", high_c: 9, low_c: 2, summary: "cloudy, light rain after 15:00" }, { day: "Friday", high_c: 11, low_c: 3, summary: "sunny intervals, windy" }] },
          { name: "search_flights", input: { from: "KRK", to: "AMS", date: "friday", depart_after: "17:30", direct_only: true }, result: [{ flight: "KL1998", depart: "18:05", arrive: "20:20", price_eur: 164, seats_left: 4 }, { flight: "LO269", depart: "20:40", arrive: "22:55", price_eur: 121, seats_left: 9 }] },
        ] },
        { say: "KL1998 at 18:05 is too tight from a 17:30 finish (the airport is ~30 min away). LO269 is cheaper and leaves enough buffer - holding it.", calls: [{ name: "hold_seat", input: { flight: "LO269" }, result: { ok: true, hold_id: "H-7XK2PQ", expires_in_hours: 24, price_eur: 121 } }] },
      ],
      final: "**Weather in Kraków**\n- Thursday: 2-9 °C, cloudy, light rain from mid-afternoon - bring an umbrella for the evening.\n- Friday: 3-11 °C, sunny intervals but windy.\n\n**Flight back on Friday** - I've **held LO269** (20:40 → 22:55, €121) for 24 hours; nothing is paid yet.\n\nI skipped KL1998 (18:05, €164): with a 17:30 finish and ~30 min to the airport you'd miss boarding.\n\nReply \"book it\" and I'll confirm the seat.",
    }, { model: "gpt-4o", system: TRAVEL_SYSTEM, tools: TRAVEL_TOOLS, temperature: 0.4, timestamp: at(5), durationMs: 3410 }) });
    starred.push(id);
  }

  // 7. HR assistant: cached handbook + personalised tool calls ─────────────────
  {
    const id = await ingest(ctx, { provider: "anthropic", log: anthropicLog({
      user: "I'm planning to spend February and March in Lisbon with my partner and keep working from there. Is that allowed, and do I still get the home-office stipend while I'm abroad?",
      turns: [
        { calls: [{ name: "get_employee_profile", input: {}, result: { name: "Daniel", contract: "full-time", location: "Amsterdam", remote_abroad_days_used_this_year: 21, manager: "Priya Raman" } }] },
        { say: "Portugal isn't restricted and you'd stay within the yearly limit, so I'll file the notice with People Ops for you.", calls: [{ name: "create_people_ops_request", input: { type: "remote_work_abroad", details: { country: "Portugal", city: "Lisbon", period: "February-March", days: 59 } }, result: { request_id: "PO-4417", status: "submitted", manager_notified: true } }] },
      ],
      final: "Yes to both, Daniel:\n\n- **Working from Lisbon:** allowed. You can work abroad for up to 90 days per calendar year [1], and Portugal isn't on the restricted list [2]. February + March is 59 days; February and March fall in the new calendar year, so this year's 21 days don't count against it.\n- **Home-office stipend:** it keeps being paid during temporary stays abroad - EUR 75 a month with your salary [3].\n\nI've filed the notice with People Ops (**PO-4417**) and Priya has been notified, which covers the 14-day notice rule [1]. Core hours stay 13:00-16:00 CET - that's 12:00-15:00 in Lisbon.",
    }, { model: "claude-haiku-4-5", system: HANDBOOK_SYSTEM, tools: HANDBOOK_TOOLS, cached: true, temperature: 0, maxTokens: 800, timestamp: at(6), durationMs: 2280 }) });
    notes.push([id, "Prompt caching at work: the handbook + tool definitions are cached, so most input tokens are cache reads - the per-question cost is a fraction of an uncached call."]);
  }

  // 8. Vercel AI SDK: shopping assistant with several tool round-trips ─────────
  await ingest(ctx, { provider: "vercel-ai", log: vercelLog({
    user: "I'm training for my first half marathon. Mostly road, about 30 km a week, and my knees get sore on long runs. Budget around €150, size EU 44.",
    turns: [
      { calls: [{ name: "searchProducts", input: { category: "road-running-shoes", cushioning: "max", maxPrice: 160, sort: "rating" }, result: [
        { sku: "ST-NB-1080", name: "New Balance Fresh Foam X 1080v14", price: 159.95, rating: 4.7, drop_mm: 6 },
        { sku: "ST-AS-NIM", name: "ASICS Gel-Nimbus 27", price: 149.95, rating: 4.6, drop_mm: 8 },
        { sku: "ST-HK-CL", name: "HOKA Clifton 10", price: 139.95, rating: 4.5, drop_mm: 8 },
      ] }] },
      { calls: [
        { name: "checkStock", input: { skus: ["ST-NB-1080", "ST-AS-NIM", "ST-HK-CL"], size: "EU 44" }, result: { "ST-NB-1080": 0, "ST-AS-NIM": 6, "ST-HK-CL": 2 } },
        { name: "getReviewHighlights", input: { sku: "ST-AS-NIM", topic: "knee pain" }, result: { mentions: 38, positive_share: 0.84, quote: "Finally no knee pain after 18 km - the heel cushioning is noticeably softer than v26." } },
      ] },
    ],
    final: "For 30 km a week with sore knees, go for cushioning over speed. In EU 44:\n\n1. **ASICS Gel-Nimbus 27 - €149.95** (6 in stock). The safest pick for longer runs - 84% of reviews mentioning knee pain are positive (\"finally no knee pain after 18 km\").\n2. **HOKA Clifton 10 - €139.95** (only 2 left). Lighter and a bit livelier, still well cushioned.\n\nThe New Balance 1080v14 would also fit, but it's **sold out in 44**.\n\nTip: buy them at least 4 weeks before race day, so you can do two or three long runs in them first.",
  }, { model: "gpt-4o-mini", provider: "openai.chat", system: "You are the shopping assistant for Stride, an online running store. Recommend at most 3 products, with price, stock and why they fit. Check stock for the customer's size.", tools: [
    { name: "searchProducts", description: "Search the catalogue.", parameters: { type: "object", properties: { category: { type: "string" }, cushioning: { type: "string" }, maxPrice: { type: "number" } } } },
    { name: "checkStock", description: "Stock per SKU for a size.", parameters: { type: "object", properties: { skus: { type: "array" }, size: { type: "string" } } } },
    { name: "getReviewHighlights", description: "Summarised reviews for a product on a topic.", parameters: { type: "object", properties: { sku: { type: "string" }, topic: { type: "string" } } } },
  ], temperature: 0.6, timestamp: at(7), durationMs: 3140 }) });

  // 9-10. Prompt A/B (v1 vs v2) for the same release - use Diff ───────────────
  {
    const release: (final: string) => AgentScript = (final) => ({
      user: "Write the changelog announcement for v2.4.",
      turns: [
        { calls: [{ name: "get_release", input: { version: "2.4" }, result: { version: "2.4", merged_prs: [
          { title: "Scheduled exports to S3 and e-mail (daily/weekly)", labels: ["feature"] },
          { title: "Batch dashboard widget queries + cache unchanged widgets", labels: ["performance"], note: "p50 load time -41%" },
          { title: "Okta SSO for Business plan", labels: ["feature", "enterprise"] },
          { title: "Fix CSV export timezone in date filter", labels: ["bug"] },
        ] } }] },
      ],
      final,
    });
    const tools = [{ name: "get_release", description: "Merged pull requests for a release.", parameters: { type: "object", properties: { version: { type: "string" } }, required: ["version"] } }];
    await ingest(ctx, { provider: "openai", log: openaiLog(release("🚀 Exciting news! Version 2.4 is here and it's our biggest release yet!\n\nWe've been working incredibly hard to bring you some amazing new features that will totally transform the way you work with your data!\n\n✨ **Scheduled Exports** - Now you can automatically export your reports daily or weekly straight to S3 or your inbox! No more manual exports!\n\n⚡ **Lightning-Fast Dashboards** - Dashboards now load a whopping 41% faster!\n\n🔐 **Okta SSO** - Business plan customers can now log in with Okta for enterprise-grade security!\n\n🐛 Plus bug fixes!\n\nWe can't wait for you to try it out! Let us know what you think! 🎉"), { model: "gpt-4o-mini", system: "Write product announcements for our changelog.", tools, temperature: 0.7, maxTokens: 500, timestamp: at(9), durationMs: 2210 }) });
    const v2 = await ingest(ctx, { provider: "openai", log: openaiLog(release("## v2.4: scheduled exports, faster dashboards, Okta SSO\n\n**Scheduled exports.** Any report can now be exported daily or weekly to an S3 bucket or by e-mail. Set it up once under *Report → Export → Schedule*.\n\n**Faster dashboards.** Widget queries are batched and unchanged widgets are cached, cutting median load time by 41%. Large dashboards benefit most.\n\n**Okta SSO (Business plan).** Admins can connect Okta under *Settings → Security*.\n\n**Fixed:** CSV exports no longer shift dates when the date filter crosses a timezone boundary."), { model: "gpt-4o-mini", system: "Write product announcements for our changelog. Audience: data engineers. Lead with what changed and why it matters. Max 120 words, no emoji, no exclamation marks, no superlatives. Mention user-visible bug fixes.", tools, temperature: 0.7, maxTokens: 500, timestamp: at(8), durationMs: 1870 }) });
    starred.push(v2);
    notes.push([v2, "Prompt v2: audience + word limit + no emoji. Compare with the v1 trace just below it using Diff - v2 is what we ship."]);
  }

  // 11. o3-mini: reasoning model + simulation tool ─────────────────────────────
  await ingest(ctx, { provider: "openai", log: openaiLog({
    user: "Our job queue retries failed jobs with `delay = base * 2^attempt` (base = 2s, max 8 attempts). After an outage all workers restarted at the same moment, ~40k jobs retried in lockstep and hammered the database again. What's the minimal change to the retry formula? Please verify it with the simulator.",
    turns: [{ calls: [
      { name: "simulate_retries", input: { jobs: 40000, base_s: 2, max_attempts: 8, strategy: "exponential" }, result: { peak_jobs_per_second: 40000, p99_wait_s: 510, waves: 8 } },
      { name: "simulate_retries", input: { jobs: 40000, base_s: 2, max_attempts: 8, strategy: "full_jitter" }, result: { peak_jobs_per_second: 712, p99_wait_s: 498, mean_total_wait_s: 256 } },
    ] }],
    final: "**Minimal change: add full jitter.**\n\n```ts\nconst cap = base * 2 ** attempt;   // same exponential envelope as today\nconst delay = Math.random() * cap;   // full jitter: uniform in [0, cap)\n```\n\nThe exponential backoff is fine - the problem is that every job waiting on attempt *n* wakes up at the same moment. The simulator confirms it:\n\n| Strategy | Peak load | Worst-case wait |\n|---|---|---|\n| exponential (today) | **40,000 jobs/s** in 8 synchronised waves | 510 s |\n| full jitter | **712 jobs/s** | 498 s (mean 256 s) |\n\nSame worst-case wait, **56× lower peak load**. Also add a small random delay to worker *startup* - the simultaneous restart is what lined everything up in the first place.",
  }, { model: "o3-mini", tools: [{ name: "simulate_retries", description: "Simulate a retry storm and report peak load and wait times.", parameters: { type: "object", properties: { jobs: { type: "integer" }, base_s: { type: "number" }, max_attempts: { type: "integer" }, strategy: { type: "string", enum: ["exponential", "equal_jitter", "full_jitter"] } }, required: ["jobs", "strategy"] } }], maxTokens: 8000, reasoningTokens: 2240, timestamp: at(10), durationMs: 16260 }) });

  // 12. GPT-4o vision: read a chart, verify it against the data ───────────────
  await ingest(ctx, { provider: "openai", log: openaiLog({
    user: [
      { type: "text", text: "Summarise this chart in 3-4 sentences for a policy brief and flag anything a reviewer might question. The underlying dataset is attached as india_education_spend.csv." },
      { type: "image", url: CHART_URL, mediaType: "image/png" },
    ],
    turns: [{ say: "Checking the values I read from the chart against the attached dataset.", calls: [{ name: "read_dataset", input: { file: "india_education_spend.csv" }, result: { columns: ["year", "pct_gdp"], rows: [[2003, 3.6], [2006, 3.1], [2009, 3.3], [2012, 3.9], [2015, 3.3], [2018, 3.2], [2021, 3.1]], source: null } }] }],
    final: "**Summary:** India's spending on education stayed between 3.1% and 3.9% of GDP from 2003 to 2021. It fell from 3.6% in 2003 to 3.1% in 2006, recovered to 3.3% in 2009 and peaked at 3.9% in 2012, then declined steadily to 3.1% by 2021 - back to its 2006 low. The values in the chart match the attached dataset exactly.\n\n**Things a reviewer might question:**\n1. **Truncated y-axis** - it starts at 3%, which makes a 0.8-point swing look dramatic. Say so in the caption or start the axis at 0.\n2. **Sparse data** - one point every three years, so the 2012 \"peak\" may be a single high year rather than a trend.\n3. **No source** - the dataset has no source column, and it's unclear whether this is central government only or central + state spending.",
  }, { model: "gpt-4o", system: "You help analysts write reports. Read charts precisely, verify numbers against attached data, and point out anything a reviewer might question.", tools: [{ name: "read_dataset", description: "Read an attached CSV file.", parameters: { type: "object", properties: { file: { type: "string" } }, required: ["file"] } }], maxTokens: 700, timestamp: at(11), durationMs: 5180 }) });

  // 13. Rate limited (429) in the middle of a support run ──────────────────────
  {
    const id = await insertFailed(ctx, { provider: "anthropic", log: anthropicLog(upToTurn(support, 2), { model: "claude-opus-4-8", system: SUPPORT_SYSTEM, tools: SUPPORT_TOOLS, timestamp: at(12), durationMs: 0 }) }, {
      statusCode: 429, durationMs: 412,
      error: "rate_limit_error: This request would exceed your organization's rate limit of 400,000 input tokens per minute (claude-opus-4-8). Please retry after 38 seconds.",
    });
    notes.push([id, "Hit the Opus ITPM limit mid-conversation during the Monday batch. The support agent normally runs on Sonnet - this was the A/B test routing 10% to Opus. Batch now caps concurrency at 2."]);
  }

  // 14. Vercel AI SDK: ticket triage with tools ────────────────────────────────
  await ingest(ctx, { provider: "vercel-ai", log: vercelLog({
    user: "Subject: Exports broken since this morning??\n\nHi, every CSV export from the Reports page fails with 'Something went wrong' since about 9am. We need the monthly numbers for a board meeting at 3pm today. Account: acme-logistics. - Jonas",
    turns: [
      { calls: [
        { name: "searchKnownIssues", input: { query: "CSV export fails Reports", since: "24h" }, result: [{ id: "INC-2291", title: "CSV export fails when the date range crosses a DST change", status: "fix in review", eta: "today" }] },
        { name: "getAccount", input: { slug: "acme-logistics" }, result: { plan: "business_annual", arr_usd: 192800, csm: "Hannah Weber", open_tickets: 2 } },
      ] },
      { calls: [{ name: "routeTicket", input: { queue: "engineering-oncall", priority: "urgent", linkIncident: "INC-2291", notify: ["Hannah Weber"] }, result: { ok: true, ticket: "SUP-30418" } }] },
    ],
    final: JSON.stringify({ category: "bug", product_area: "reports/export", known_issue: "INC-2291", sentiment: "frustrated", urgency: "urgent", deadline: "today 15:00", routed_to: "engineering-oncall", csm_notified: "Hannah Weber", suggested_workaround: "Export with a date range that doesn't cross the DST change (e.g. split the month in two).", summary: "Acme (Business, $193k ARR) can't export CSVs since ~09:00; matches INC-2291 (fix in review). Board meeting at 15:00." }, null, 2),
  }, { model: "claude-haiku-4-5", provider: "anthropic.messages", type: "ai.generateText", system: "Triage incoming support tickets: check for known incidents, look up the account, route the ticket, then reply with the triage JSON only.", tools: [
    { name: "searchKnownIssues", description: "Search open incidents.", parameters: { type: "object", properties: { query: { type: "string" }, since: { type: "string" } } } },
    { name: "getAccount", description: "Account details by slug.", parameters: { type: "object", properties: { slug: { type: "string" } } } },
    { name: "routeTicket", description: "Route a ticket to a queue.", parameters: { type: "object", properties: { queue: { type: "string" }, priority: { type: "string" }, linkIncident: { type: "string" }, notify: { type: "array" } } } },
  ], temperature: 0, timestamp: at(13), durationMs: 2860 }) });

  // 15. Blog post that runs into max_tokens after the research steps ──────────
  await ingest(ctx, { provider: "vercel-ai", log: vercelLog({
    user: "Write a blog post (~1200 words) about how we cut our p95 API latency from 840 ms to 210 ms. Use the real numbers from the metrics and the postmortems.",
    turns: [{ calls: [
      { name: "queryMetrics", input: { metric: "api.latency.p95", range: "90d", step: "1w" }, result: { start_ms: 840, end_ms: 210, drops: [{ week: 3, to_ms: 560, change: "PgBouncer rollout" }, { week: 7, to_ms: 330, change: "N+1 fixes in orders/invoices" }, { week: 10, to_ms: 210, change: "PDF rendering moved to queue" }] } },
      { name: "searchDocs", input: { query: "latency postmortem", space: "engineering" }, result: [{ title: "Connection storms under load", summary: "~400 connections, TLS + auth cost 40-300 ms per cold request" }, { title: "Orders endpoint N+1", summary: "4,600 queries for the largest account" }] },
    ] }],
    final: "# How we cut p95 latency by 75% without rewriting anything\n\nThree months ago, our API's p95 latency was 840 ms. Customers didn't complain loudly, but our dashboards told a clear story: the slowest 5% of requests were getting slower every month, and they were concentrated in exactly the places customers care about - invoices, reports and exports.\n\nToday that number is 210 ms. We didn't rewrite a service or change languages. We fixed three boring things, in this order: connection pooling (840 → 560 ms), N+1 queries (560 → 330 ms) and synchronous PDF rendering (330 → 210 ms).\n\n## 1. Connection pooling: the 300 ms we were paying on cold requests\n\nOur Node services opened fresh PostgreSQL connections far too often. At peak we had around 400 of them, and the TLS handshake plus authentication cost 40 ms on a good day and up to 300 ms under load.\n\nWe moved to PgBouncer in transaction mode and capped each service at 20 pooled connections. Two things surprised us:\n\n- **Fewer connections made us faster.** Postgres spends real CPU on each connection; going from ~400 to 120 reduced lock contention noticeably.\n- **Prepared statements needed care.** In transaction mode they don't survive between transactions, so we",
  }, { model: "gpt-4o", provider: "openai.chat", type: "ai.generateText", system: "You write the Northwind engineering blog. Clear, concrete, no hype. Always ground numbers in the metrics and postmortems.", tools: [
    { name: "queryMetrics", description: "Time series for a metric.", parameters: { type: "object", properties: { metric: { type: "string" }, range: { type: "string" }, step: { type: "string" } } } },
    { name: "searchDocs", description: "Search the engineering wiki.", parameters: { type: "object", properties: { query: { type: "string" }, space: { type: "string" } } } },
  ], maxTokens: 600, truncated: true, timestamp: at(14), durationMs: 11480 }) });

  // 16. Context window exceeded (400) after pulling too many logs ──────────────
  await insertFailed(ctx, { provider: "openai", log: openaiLog({
    user: "We had 502s from 14:02 to 14:47 UTC. Find the root cause.",
    turns: [
      { calls: [{ name: "get_alert", input: { alert_id: "PD-58213" }, result: { service: "gateway", condition: "5xx rate > 5%", started: "14:02 UTC", resolved: "14:47 UTC", peak_error_rate: 0.23 } }] },
      { calls: [{ name: "search_logs", input: { query: "{namespace=\"prod\"} |= \"error\"", limit: 10000 }, result: "[9,814 log lines from 6 pods, 14:00-14:50 UTC - 131,402 tokens]" }] },
    ],
    final: "",
  }, { model: "gpt-4o", system: SRE_SYSTEM, tools: SRE_TOOLS, timestamp: at(15), durationMs: 0 }) }, {
    statusCode: 400, durationMs: 288,
    error: "context_length_exceeded: This model's maximum context length is 128000 tokens. However, your messages resulted in 141,203 tokens. Please reduce the length of the messages.",
  });

  // 17. Analyst: multi-turn chat with SQL tool calls ────────────────────────────
  await ingest(ctx, { provider: "openai", log: openaiLog({
    history: [["How do I get the latest order per customer in Postgres?", "Use `DISTINCT ON`:\n\n```sql\nSELECT DISTINCT ON (customer_id) *\nFROM orders\nORDER BY customer_id, created_at DESC;\n```"]],
    user: "Run it for customers whose latest order is older than 90 days - how many are there, and how much did they spend in total?",
    turns: [
      { calls: [{ name: "get_schema", input: { tables: ["orders"] }, result: { orders: ["id", "customer_id", "created_at", "total_eur", "status"] } }] },
      { calls: [{ name: "run_sql", input: { query: "WITH latest AS (\n  SELECT DISTINCT ON (customer_id) customer_id, created_at\n  FROM orders WHERE status = 'paid'\n  ORDER BY customer_id, created_at DESC\n)\nSELECT count(*) AS customers,\n       (SELECT sum(total_eur) FROM orders o JOIN latest l USING (customer_id) WHERE l.created_at < now() - interval '90 days') AS lifetime_eur\nFROM latest WHERE created_at < now() - interval '90 days';" }, result: [{ customers: 1284, lifetime_eur: 412880.5 }] }] },
    ],
    final: "| Dormant customers (no order in 90+ days) | Their lifetime spend |\n|---|---|\n| **1,284** | **€412,880** |\n\nThat's about €320 per customer, so a win-back campaign is worth testing. I counted only `paid` orders - refunded or cancelled orders don't make a customer \"active\".\n\nFor speed, an index on `orders (customer_id, created_at DESC)` lets `DISTINCT ON` skip the sort.",
  }, { model: "gpt-4o-mini", system: ANALYST_SYSTEM, tools: ANALYST_TOOLS, temperature: 0.2, timestamp: at(16), durationMs: 2140 }) });

  return { starred, notes };
}
