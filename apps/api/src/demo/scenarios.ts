// System prompts, tool definitions and agent-script variants for the demo seed.
// Each factory returns a fresh multi-step script (randomised names, ids, numbers),
// used for the background traffic and, in a hand-tuned form, for the showcase.

import { type AgentScript, type ToolDef, ago, isoDate, pick, randInt, rid, DAY } from "./agent";

// ── shared fake data ──────────────────────────────────────────────────────────

const FIRST_NAMES = ["Maya", "Jonas", "Priya", "Tom", "Lena", "Sam", "Aisha", "Mateo", "Hannah", "Kenji", "Olivia", "Rafael"];
const COMPANIES = [
  { name: "Acme Logistics", domain: "acme-logistics.com" },
  { name: "Globex", domain: "globex.io" },
  { name: "Initech", domain: "initech.com" },
  { name: "Umbrella Labs", domain: "umbrella-labs.com" },
  { name: "Hooli", domain: "hooli.xyz" },
  { name: "Vandelay Industries", domain: "vandelay.co" },
  { name: "Stark Retail", domain: "stark-retail.eu" },
];

function customer() {
  const first = pick(FIRST_NAMES);
  const company = pick(COMPANIES);
  return { first, company: company.name, email: `${first.toLowerCase()}@${company.domain}`, id: `cus_${rid(8)}` };
}

// ── support agent ─────────────────────────────────────────────────────────────

export const SUPPORT_SYSTEM = `You are Nova, the support agent for Northwind Cloud (B2B analytics SaaS).

## Tone
- Friendly, concise, no corporate filler. Use the customer's first name.
- Never blame the customer. Own mistakes on our side.

## Billing policy
- Duplicate charges: refund the duplicate immediately, no approval needed.
- Refunds up to $500 can be issued by you; above that, escalate to billing@northwind.io.
- Refunds land in 5-10 business days depending on the bank.
- Plan downgrades take effect at the end of the billing period; no partial refunds.
- Seats added mid-cycle are prorated.

## Tools
- Always verify the customer with lookup_customer before touching billing.
- Confirm a billing problem with list_charges or get_subscription before acting on it.
- Explain every action you take in plain language.

## Escalation
Escalate to a human (handoff_to_human) for: legal threats, security incidents,
data deletion requests, or anything you are not sure about.`;

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export const SUPPORT_TOOLS: ToolDef[] = [
  { name: "lookup_customer", description: "Find a customer account by e-mail. Returns plan, seats and account status.", parameters: obj({ email: { type: "string", format: "email" } }, ["email"]) },
  { name: "get_subscription", description: "Current subscription: plan, seats, price per seat, renewal date.", parameters: obj({ customer_id: { type: "string" } }, ["customer_id"]) },
  { name: "list_charges", description: "List card charges for a customer, newest first.", parameters: obj({ customer_id: { type: "string" }, since: { type: "string", format: "date" } }, ["customer_id"]) },
  { name: "issue_refund", description: "Refund a charge, fully or partially. Max $500 without escalation (duplicates excepted).", parameters: obj({ charge_id: { type: "string" }, amount_cents: { type: "integer" }, reason: { type: "string", enum: ["duplicate", "requested_by_customer", "service_issue"] } }, ["charge_id", "amount_cents", "reason"]) },
  { name: "update_seats", description: "Change the number of seats; prorated immediately.", parameters: obj({ customer_id: { type: "string" }, seats: { type: "integer", minimum: 1 } }, ["customer_id", "seats"]) },
  { name: "pause_dunning", description: "Pause automatic suspension for unpaid invoices.", parameters: obj({ customer_id: { type: "string" }, days: { type: "integer", maximum: 14 } }, ["customer_id", "days"]) },
  { name: "update_tax_id", description: "Set the customer's VAT / tax id.", parameters: obj({ customer_id: { type: "string" }, tax_id: { type: "string" } }, ["customer_id", "tax_id"]) },
  { name: "regenerate_invoice", description: "Re-issue an invoice PDF with current billing details.", parameters: obj({ invoice_id: { type: "string" } }, ["invoice_id"]) },
  { name: "handoff_to_human", description: "Escalate the conversation to the human support queue.", parameters: obj({ summary: { type: "string" }, priority: { type: "string", enum: ["low", "normal", "high"] } }, ["summary"]) },
];

export const supportScripts: Array<() => AgentScript> = [
  () => {
    const c = customer(); const seats = randInt(8, 40); const add = pick([3, 5, 10]); const days = randInt(9, 22);
    const prorated = ((add * 49 * days) / 30).toFixed(2);
    return {
      user: `Hi, we're onboarding a new team - can we add ${add} seats to our plan right away? This is ${c.email}.`,
      turns: [
        { say: `Happy to help, ${c.first}. Let me check your account first.`, calls: [{ name: "lookup_customer", input: { email: c.email }, result: { customer_id: c.id, name: c.first, company: c.company, plan: "pro_monthly", seats, status: "active" } }] },
        { calls: [{ name: "get_subscription", input: { customer_id: c.id }, result: { plan: "pro_monthly", seats, price_per_seat_usd: 49, renews_in_days: days } }] },
        { say: `Adding ${add} seats now (${seats} → ${seats + add}).`, calls: [{ name: "update_seats", input: { customer_id: c.id, seats: seats + add }, result: { ok: true, seats: seats + add, prorated_charge_usd: Number(prorated), next_invoice_usd: (seats + add) * 49 } }] },
      ],
      final: `Done, ${c.first} - your plan now has **${seats + add} seats**.\n\n- Today you'll be charged a prorated **$${prorated}** for the remaining ${days} days of this cycle.\n- From your next renewal the plan is **$${(seats + add) * 49}/month** (${seats + add} × $49).\n\nThe new seats are available immediately - invite people from Settings → Members.`,
    };
  },
  () => {
    const c = customer(); const amount = pick([588, 1176, 245, 980]);
    return {
      user: `Our card payment failed and now there's a red banner saying the workspace will be suspended. The card is fine - we use it everywhere. ${c.email}`,
      turns: [
        { calls: [{ name: "lookup_customer", input: { email: c.email }, result: { customer_id: c.id, name: c.first, company: c.company, plan: "business_monthly", status: "past_due" } }] },
        { calls: [{ name: "list_charges", input: { customer_id: c.id, since: isoDate(ago(10 * DAY)) }, result: [
          { charge_id: `ch_${rid(10)}`, amount_cents: amount * 100, status: "failed", failure_code: "do_not_honor", created: isoDate(ago(2 * DAY)) },
          { charge_id: `ch_${rid(10)}`, amount_cents: amount * 100, status: "failed", failure_code: "do_not_honor", created: isoDate(ago(5 * DAY)) },
        ] }] },
        { say: "Both attempts were declined by the bank, not by us. I'll stop the suspension while you sort it out.", calls: [{ name: "pause_dunning", input: { customer_id: c.id, days: 7 }, result: { ok: true, suspension_paused_until: isoDate(ago(-7 * DAY)) } }] },
      ],
      final: `Thanks for flagging it, ${c.first}. Here's what I found:\n\n- Both payment attempts ($${amount}) were declined **by your bank** with code \`do_not_honor\`. That usually means the bank's fraud filter blocked a foreign transaction - our processor is based in Ireland.\n- I've **paused the suspension for 7 days**, so nothing will happen to your workspace in the meantime.\n\nNext step: ask your bank to allow payments to *Northwind Cloud*, then click **Retry payment** in Settings → Billing. If it fails again, reply here and we'll set you up with a bank transfer instead.`,
    };
  },
  () => {
    const c = customer(); const seats = randInt(5, 25);
    return {
      user: `We're thinking about moving from Business back to Pro to save money. What exactly do we lose, and when would it take effect? (${c.email})`,
      turns: [
        { calls: [{ name: "lookup_customer", input: { email: c.email }, result: { customer_id: c.id, name: c.first, company: c.company, plan: "business_annual", seats, status: "active" } }] },
        { calls: [{ name: "get_subscription", input: { customer_id: c.id }, result: { plan: "business_annual", seats, price_per_seat_usd: 89, renews_on: isoDate(ago(-randInt(40, 200) * DAY)), features_in_use: ["sso_okta", "audit_log", "custom_retention_365d"] } }] },
      ],
      final: `Good question to ask before switching, ${c.first}. Based on how you use Northwind today:\n\n**What you'd lose on Pro**\n- **Okta SSO** - you're using it, so everyone would go back to e-mail + password logins.\n- **Audit log** - also in use; history is kept but becomes read-only.\n- **365-day retention** - Pro keeps 90 days, so older reports become read-only.\n\n**Cost:** ${seats} seats × ($89 → $49) saves **$${seats * 40}/month**.\n\n**Timing:** downgrades take effect at the end of your annual term - no partial refunds. Nothing is deleted.\n\nIf SSO is the blocker, I can ask our team about a Pro + SSO add-on - want me to?`,
    };
  },
  () => {
    const c = customer(); const vat = `NL${randInt(100000000, 999999999)}B01`; const inv = `in_${rid(10)}`;
    return {
      user: `Our accounts team needs the last invoice with our VAT number on it: ${vat}. Account ${c.email}.`,
      turns: [
        { calls: [{ name: "lookup_customer", input: { email: c.email }, result: { customer_id: c.id, name: c.first, company: c.company, plan: "pro_monthly", status: "active", tax_id: null, last_invoice: inv } }] },
        { say: "Saving the VAT number to your billing details first, so future invoices include it too.", calls: [{ name: "update_tax_id", input: { customer_id: c.id, tax_id: vat }, result: { ok: true, validated_vies: true, company_name: c.company } }] },
        { calls: [{ name: "regenerate_invoice", input: { invoice_id: inv }, result: { ok: true, pdf_url: `https://billing.northwind.io/i/${inv}.pdf`, emailed_to: c.email } }] },
      ],
      final: `All set, ${c.first}:\n\n1. Your VAT number **${vat}** is saved and was validated against the EU VIES register (registered to ${c.company}).\n2. I re-issued your last invoice with the VAT number - it's on its way to ${c.email}, and you can also [download the PDF](https://billing.northwind.io/i/${inv}.pdf).\n\nEvery future invoice will include it automatically.`,
    };
  },
  () => {
    const c = customer();
    return {
      user: `URGENT: someone in our team got a login alert from an IP in another country and we didn't log in from there. Can you lock the account? ${c.email}`,
      turns: [
        { calls: [{ name: "lookup_customer", input: { email: c.email }, result: { customer_id: c.id, name: c.first, company: c.company, plan: "business_monthly", status: "active", sso: false } }] },
        { say: "This is a potential security incident, so I'm escalating it to our security team right away.", calls: [{ name: "handoff_to_human", input: { summary: `${c.company}: unrecognised login from a foreign IP reported by ${c.email}; customer asks to lock the account.`, priority: "high" }, result: { ok: true, ticket: `SEC-${randInt(1000, 9999)}`, queue: "security", eta_minutes: 15 } }] },
      ],
      final: `Thanks for reporting this so quickly, ${c.first} - I've escalated it to our **security team as high priority**; someone will contact you within about 15 minutes.\n\nWhile you wait, please:\n1. Have the affected person **change their password** now.\n2. In Settings → Members, **sign them out of all sessions**.\n3. Don't delete anything - the security team will need the login history.\n\nI can't lock the account myself, but the security team can, and they'll confirm everything with you directly.`,
    };
  },
];

// ── coding agent ──────────────────────────────────────────────────────────────

export const CODING_SYSTEM = "You are a senior engineer working in the billing-service repository (TypeScript, Express, Vitest, PostgreSQL). Make the smallest change that fixes the problem, run the relevant tests before and after, and finish with a short summary of the root cause and the fix.";

export const CODING_TOOLS: ToolDef[] = [
  { name: "read_file", description: "Read a file from the repository.", parameters: obj({ path: { type: "string" } }, ["path"]) },
  { name: "search_code", description: "Search the repository with a regular expression.", parameters: obj({ pattern: { type: "string" }, glob: { type: "string" } }, ["pattern"]) },
  { name: "write_file", description: "Overwrite a file in the repository.", parameters: obj({ path: { type: "string" }, content: { type: "string" } }, ["path", "content"]) },
  { name: "run_tests", description: "Run Vitest, optionally filtered by a name pattern.", parameters: obj({ pattern: { type: "string" } }) },
];

export const codingScripts: Array<() => AgentScript> = [
  () => ({
    user: "The `formatBillingPeriod` test fails on CI but passes on my machine. Can you figure out why?",
    turns: [
      { calls: [{ name: "read_file", input: { path: "src/lib/billing-period.test.ts" }, result: "it('formats a monthly period', () => {\n  const start = new Date('2026-03-01');\n  expect(formatBillingPeriod(start, 'monthly')).toBe('Mar 1 - Mar 31, 2026');\n});" }] },
      { calls: [{ name: "run_tests", input: { pattern: "billing-period" }, isError: true, result: "FAIL src/lib/billing-period.test.ts > formats a monthly period\nAssertionError: expected 'Feb 28 - Mar 30, 2026' to be 'Mar 1 - Mar 31, 2026'\n\nTests  1 failed | 6 passed (7)\n(TZ=America/Los_Angeles)" }] },
      { say: "Reproduced with the CI timezone. `new Date('2026-03-01')` is midnight UTC, which is still Feb 28 in Los Angeles. The formatter uses local time.", calls: [{ name: "read_file", input: { path: "src/lib/billing-period.ts" }, result: "export function formatBillingPeriod(start: Date, cycle: Cycle) {\n  const end = addMonths(start, 1); end.setDate(end.getDate() - 1);\n  return `${fmt(start)} - ${fmt(end)}, ${end.getFullYear()}`;\n}" }] },
      { calls: [{ name: "write_file", input: { path: "src/lib/billing-period.ts", content: "export function formatBillingPeriod(start: Date, cycle: Cycle) {\n  // Billing periods are calendar dates in UTC - never the server's local time.\n  const end = addMonthsUTC(start, 1); end.setUTCDate(end.getUTCDate() - 1);\n  return `${fmtUTC(start)} - ${fmtUTC(end)}, ${end.getUTCFullYear()}`;\n}" }, result: "Wrote 284 bytes to src/lib/billing-period.ts" }] },
      { calls: [{ name: "run_tests", input: { pattern: "billing-period" }, result: "✓ src/lib/billing-period.test.ts (7 tests) 38ms\n\nTests  7 passed (7)" }] },
    ],
    final: "Fixed - the test passes in every timezone now.\n\n**Root cause:** `formatBillingPeriod` used local-time date methods. Your machine runs in CET, CI runs with `TZ=America/Los_Angeles`, where midnight UTC on Mar 1 is still Feb 28 - so CI printed the wrong period.\n\n**Fix:** use UTC throughout (`setUTCDate`, `getUTCFullYear`, a UTC formatter). Billing periods are calendar dates, so they should never depend on the server's timezone.\n\nTip: add `TZ=Pacific/Kiritimati` (UTC+14) to one CI job - it catches this whole class of bugs.",
  }),
  () => ({
    user: "GET /customers/:id/orders got really slow for big accounts (8s+ for Acme). Can you take a look?",
    turns: [
      { calls: [{ name: "read_file", input: { path: "src/routes/orders.ts" }, result: "const orders = await db.orders.findByCustomer(req.params.id);\nfor (const order of orders) {\n  order.items = await db.orderItems.findByOrder(order.id);\n  order.invoice = await db.invoices.findByOrder(order.id);\n}\nreturn res.json(orders);" }] },
      { say: "Classic N+1: two queries per order. Acme has ~2,300 orders, so that's ~4,600 round trips. Let me check whether batch loaders already exist.", calls: [{ name: "search_code", input: { pattern: "findByOrders\\(|findManyByOrderIds", glob: "src/db/**" }, result: "src/db/order-items.ts:41: export async function findByOrders(orderIds: string[])\nsrc/db/invoices.ts:58: export async function findByOrders(orderIds: string[])" }] },
      { calls: [{ name: "write_file", input: { path: "src/routes/orders.ts", content: "const orders = await db.orders.findByCustomer(req.params.id);\nconst ids = orders.map((o) => o.id);\nconst [items, invoices] = await Promise.all([\n  db.orderItems.findByOrders(ids),\n  db.invoices.findByOrders(ids),\n]);\nconst itemsByOrder = groupBy(items, (i) => i.orderId);\nconst invoiceByOrder = keyBy(invoices, (i) => i.orderId);\nreturn res.json(orders.map((o) => ({ ...o, items: itemsByOrder[o.id] ?? [], invoice: invoiceByOrder[o.id] ?? null })));" }, result: "Wrote 431 bytes to src/routes/orders.ts" }] },
      { calls: [{ name: "run_tests", input: { pattern: "orders" }, result: "✓ src/routes/orders.test.ts (14 tests) 302ms\n\nTests  14 passed (14)" }] },
    ],
    final: "Done - all 14 order tests pass.\n\n**Root cause:** an N+1 query. For every order the route made two extra queries (items + invoice), so Acme's ~2,300 orders meant ~4,600 database round trips.\n\n**Fix:** load items and invoices for all orders in **two batched queries** (the `findByOrders` helpers already existed) and join them in memory. That's 3 queries total regardless of account size; I'd expect Acme's request to drop well under 500 ms.\n\nFollow-up worth doing: this endpoint isn't paginated - with a `limit`/`cursor` the response size would stay bounded too.",
  }),
  () => ({
    user: "Stripe webhooks are failing with 500s since this morning - Sentry shows `Cannot read properties of undefined (reading 'id')` in the webhook handler.",
    turns: [
      { calls: [{ name: "read_file", input: { path: "src/webhooks/stripe.ts" }, result: "case 'invoice.paid': {\n  const invoice = event.data.object;\n  await markPaid(invoice.subscription.id, invoice.amount_paid);\n  break;\n}" }] },
      { calls: [{ name: "run_tests", input: { pattern: "stripe webhook" }, isError: true, result: "FAIL src/webhooks/stripe.test.ts > invoice.paid > handles one-off invoices\nTypeError: Cannot read properties of null (reading 'id')\n ❯ src/webhooks/stripe.ts:3:42\n\nTests  1 failed | 9 passed (10)" }] },
      { say: "One-off invoices (no subscription) now arrive since we launched paid add-ons. `invoice.subscription` is null for them.", calls: [{ name: "write_file", input: { path: "src/webhooks/stripe.ts", content: "case 'invoice.paid': {\n  const invoice = event.data.object;\n  if (invoice.subscription) {\n    await markPaid(invoice.subscription.id, invoice.amount_paid);\n  } else {\n    await markOneOffPaid(invoice.id, invoice.amount_paid);\n  }\n  break;\n}" }, result: "Wrote 236 bytes to src/webhooks/stripe.ts" }] },
      { calls: [{ name: "run_tests", input: { pattern: "stripe webhook" }, result: "✓ src/webhooks/stripe.test.ts (10 tests) 121ms\n\nTests  10 passed (10)" }] },
    ],
    final: "Fixed - webhook tests are green.\n\n**Root cause:** since this morning's release we sell one-off add-ons. Their invoices have no subscription, so `invoice.subscription` is `null` and the handler crashed on `.id`. Stripe got a 500 and keeps retrying.\n\n**Fix:** handle both cases - subscription invoices go through `markPaid` as before, one-off invoices through `markOneOffPaid`.\n\n**After deploying:** the failed events will be retried by Stripe automatically for up to 3 days, so no manual replay should be needed. Worth checking the Stripe dashboard tomorrow that the backlog is empty.",
  }),
  () => ({
    user: "Add validation to GET /reports - `limit` should be 1-200 and default to 50. Right now limit=100000 takes the DB down.",
    turns: [
      { calls: [{ name: "read_file", input: { path: "src/routes/reports.ts" }, result: "router.get('/reports', async (req, res) => {\n  const limit = Number(req.query.limit ?? 50);\n  const rows = await db.reports.list({ orgId: req.org.id, limit });\n  res.json(rows);\n});" }] },
      { calls: [{ name: "write_file", input: { path: "src/routes/reports.ts", content: "const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });\n\nrouter.get('/reports', async (req, res) => {\n  const { limit } = ListQuery.parse(req.query);\n  const rows = await db.reports.list({ orgId: req.org.id, limit });\n  res.json(rows);\n});" }, result: "Wrote 312 bytes to src/routes/reports.ts" }] },
      { calls: [{ name: "run_tests", input: { pattern: "reports" }, isError: true, result: "FAIL src/routes/reports.test.ts > GET /reports > rejects limit above 200\nexpected 400, received 500 (ZodError)\n\nTests  1 failed | 8 passed (9)" }] },
      { say: "Validation works, but a ZodError surfaces as a 500. The other routes use the `validate` middleware, which maps it to a 400 - I'll use that instead.", calls: [{ name: "write_file", input: { path: "src/routes/reports.ts", content: "const ListQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });\n\nrouter.get('/reports', validate({ query: ListQuery }), async (req, res) => {\n  const { limit } = req.query as z.infer<typeof ListQuery>;\n  const rows = await db.reports.list({ orgId: req.org.id, limit });\n  res.json(rows);\n});" }, result: "Wrote 351 bytes to src/routes/reports.ts" }] },
      { calls: [{ name: "run_tests", input: { pattern: "reports" }, result: "✓ src/routes/reports.test.ts (9 tests) 87ms\n\nTests  9 passed (9)" }] },
    ],
    final: "Done - `limit` is validated and all 9 report tests pass.\n\n- `limit` must be an integer from **1 to 200**, defaults to **50**.\n- Invalid values return **400** with a readable message (via the existing `validate` middleware), not 500.\n\nThe first attempt validated inline and leaked the `ZodError` as a 500 - the test caught it. Other list endpoints (`/exports`, `/dashboards`) have the same unbounded `limit`; want me to apply the same fix there?",
  }),
];

// ── handbook / HR agent (RAG with prompt caching) ─────────────────────────────

export const HANDBOOK_SYSTEM = `You answer employee questions using ONLY the handbook excerpts below and the HR tools.
Cite handbook sections as [n]. If the excerpts don't cover the question, say so and suggest asking People Ops.
Personalise answers with get_employee_profile when the question depends on the employee's situation.

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

export const HANDBOOK_TOOLS: ToolDef[] = [
  { name: "get_employee_profile", description: "The asking employee's HR profile: location, contract, balances.", parameters: obj({}) },
  { name: "get_expense_history", description: "The employee's past expense claims in a category.", parameters: obj({ category: { type: "string" } }, ["category"]) },
  { name: "create_people_ops_request", description: "Open a request with People Ops on the employee's behalf.", parameters: obj({ type: { type: "string" }, details: { type: "object" } }, ["type"]) },
];

export const handbookScripts: Array<() => AgentScript> = [
  () => {
    const spent = randInt(200, 1100);
    return {
      user: "How much learning budget do I have left this year? I'd like to go to a conference in Austin in March.",
      turns: [{ calls: [{ name: "get_expense_history", input: { category: "learning" }, result: { year: new Date().getFullYear(), claims: [{ item: "Frontend Masters subscription", eur: 390 }, { item: "Books", eur: spent - 390 > 0 ? spent - 390 : 64 }], total_eur: Math.max(spent, 454) } }] }],
      final: `You've used **EUR ${Math.max(spent, 454)}** of your EUR 1,500 learning budget this year [6], so **EUR ${1500 - Math.max(spent, 454)}** is left - but note that unused budget doesn't roll over [6], and March falls in **next year's** budget, which starts fresh at EUR 1,500.\n\nFor the Austin trip, the conference ticket and travel both count against that budget [6]. The flight from Amsterdam is over 8 hours, so **premium economy is allowed** [7].`,
    };
  },
  () => ({
    user: "My monitor broke. Can I expense a new one?",
    turns: [{ calls: [{ name: "get_expense_history", input: { category: "equipment" }, result: { claims: [{ item: "Ergonomic chair", eur: 420, date: isoDate(ago(randInt(500, 900) * DAY)) }] } }] }],
    final: "Yes. Monitors, chairs and desks can be expensed once every 4 years, up to **EUR 900 in total** [4]. You claimed a chair for EUR 420 within the current 4-year window, so you have **EUR 480** left for the monitor.\n\nBuy it, then submit the receipt under Expenses → Equipment.",
  }),
  () => ({
    user: "My partner is due in May. How long is my parental leave as the non-birthing parent, and can I split it?",
    turns: [
      { calls: [{ name: "get_employee_profile", input: {}, result: { contract: "full-time", location: "Amsterdam", start_date: isoDate(ago(randInt(400, 1500) * DAY)) } }] },
      { calls: [{ name: "create_people_ops_request", input: { type: "parental_leave_info", details: { expected_date: "May", role: "non-birthing parent" } }, result: { request_id: `PO-${randInt(1000, 9999)}`, owner: "People Ops", sla_days: 3 } }] },
    ],
    final: "Congratulations! As the non-birthing parent you get **12 weeks of fully paid leave** [5].\n\nYou can split it into **up to three blocks**, all within 18 months of the birth [5] - for example 4 weeks around the due date and the rest later.\n\nYour home-office stipend keeps being paid unless a single leave block is longer than 30 days [3]. I've also opened a request with People Ops so they can walk you through the paperwork - they'll get back to you within 3 working days.",
  }),
  () => ({
    user: "Can I work from Belgrade for two weeks in December?",
    turns: [{ calls: [{ name: "get_employee_profile", input: {}, result: { location: "Amsterdam", remote_abroad_days_used_this_year: randInt(5, 60) } }] }],
    final: "Yes. Serbia isn't on the restricted list [2], and two weeks is well within the 90-day yearly limit for working abroad [1] - you've still got room this year.\n\nJust tell your manager and People Ops **at least 14 days before you go** [1], and keep the core hours 13:00-16:00 CET (Belgrade is the same timezone, so nothing changes).",
  }),
];

// ── data analyst agent (OpenAI, SQL tools) ────────────────────────────────────

export const ANALYST_SYSTEM = "You are a data analyst with read-only access to the product warehouse (PostgreSQL). Inspect the schema before querying, never guess column names, and present results as a small table followed by 2-3 sentences of interpretation.";

export const ANALYST_TOOLS: ToolDef[] = [
  { name: "get_schema", description: "Columns of the given tables.", parameters: obj({ tables: { type: "array", items: { type: "string" } } }, ["tables"]) },
  { name: "run_sql", description: "Run a read-only SQL query (max 1,000 rows).", parameters: obj({ query: { type: "string" } }, ["query"]) },
];

export const analystScripts: Array<() => AgentScript> = [
  () => {
    const rows = [["organic", randInt(380, 520)], ["paid_search", randInt(210, 330)], ["referral", randInt(90, 160)], ["partner", randInt(30, 80)]] as const;
    return {
      user: "Which acquisition channels brought in the most signups in the last 4 weeks, and how many converted to paid?",
      turns: [
        { calls: [{ name: "get_schema", input: { tables: ["signups", "subscriptions"] }, result: { signups: ["id", "created_at", "channel", "org_id"], subscriptions: ["org_id", "plan", "started_at", "status"] } }] },
        { calls: [{ name: "run_sql", input: { query: "SELECT s.channel, count(*) AS signups, count(sub.org_id) AS paid\nFROM signups s\nLEFT JOIN subscriptions sub ON sub.org_id = s.org_id AND sub.plan <> 'trial'\nWHERE s.created_at >= now() - interval '28 days'\nGROUP BY 1 ORDER BY 2 DESC;" }, result: rows.map(([channel, n]) => ({ channel, signups: n, paid: Math.round(n * (channel === "referral" ? 0.21 : channel === "partner" ? 0.26 : channel === "organic" ? 0.12 : 0.08)) })) }] },
      ],
      final: `| Channel | Signups | Paid | Conversion |\n|---|---|---|---|\n${rows.map(([c, n]) => { const r = c === "referral" ? 0.21 : c === "partner" ? 0.26 : c === "organic" ? 0.12 : 0.08; return `| ${c} | ${n} | ${Math.round(n * r)} | ${Math.round(r * 100)}% |`; }).join("\n")}\n\n**Organic** brings the most signups, but **referral and partner** convert two to three times better. **Paid search** has the weakest conversion (8%) - worth checking the cost per paid customer before increasing that budget.`,
    };
  },
  () => ({
    user: "What's our monthly churn by plan over the last 6 months? Is Pro getting worse?",
    turns: [
      { calls: [{ name: "get_schema", input: { tables: ["subscriptions"] }, result: { subscriptions: ["org_id", "plan", "started_at", "cancelled_at", "status"] } }] },
      { calls: [{ name: "run_sql", input: { query: "SELECT date_trunc('month', cancelled_at) AS month, plan,\n       count(*)::float / nullif(count(*), 0) AS churn\nFROM subscriptions WHERE cancelled_at > now() - interval '6 months'\nGROUP BY 1, 2 ORDER BY 1, 2;" }, result: [{ month: "(all 6 months)", plan: "pro", churn: 1.0 }, { month: "(all 6 months)", plan: "business", churn: 1.0 }] }] },
      { say: "Every value is exactly 1.0 - my query divided cancellations by themselves. The denominator has to be the active subscriptions at the start of each month.", calls: [{ name: "run_sql", input: { query: "WITH months AS (SELECT generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS m)\nSELECT m AS month, plan,\n  count(*) FILTER (WHERE cancelled_at >= m AND cancelled_at < m + interval '1 month')::float\n  / count(*) FILTER (WHERE started_at < m AND (cancelled_at IS NULL OR cancelled_at >= m)) AS churn\nFROM months CROSS JOIN subscriptions GROUP BY 1, 2 ORDER BY 1, 2;" }, result: [{ plan: "pro", churn_by_month: [2.1, 2.4, 2.2, 2.9, 3.4, 3.8] }, { plan: "business", churn_by_month: [0.9, 1.1, 0.8, 1.0, 0.9, 1.0] }] }] },
    ],
    final: "| Plan | 6 mo ago | 5 | 4 | 3 | 2 | Last month |\n|---|---|---|---|---|---|---|\n| Pro | 2.1% | 2.4% | 2.2% | 2.9% | 3.4% | **3.8%** |\n| Business | 0.9% | 1.1% | 0.8% | 1.0% | 0.9% | 1.0% |\n\n**Yes - Pro churn is rising**: it has nearly doubled in six months and has gone up for three months in a row. Business is stable at about 1%. The rise started three months ago - worth checking what changed then (pricing, onboarding, a competitor launch?).",
  }),
  () => ({
    user: "Who are our 5 biggest accounts by revenue this quarter, and is any of them at risk?",
    turns: [
      { calls: [
        { name: "run_sql", input: { query: "SELECT o.name, sum(i.amount_usd) AS revenue\nFROM invoices i JOIN orgs o ON o.id = i.org_id\nWHERE i.paid_at >= date_trunc('quarter', now())\nGROUP BY 1 ORDER BY 2 DESC LIMIT 5;" }, result: [{ name: "Acme Logistics", revenue: 48200 }, { name: "Globex", revenue: 39650 }, { name: "Stark Retail", revenue: 31100 }, { name: "Initech", revenue: 27480 }, { name: "Hooli", revenue: 22900 }] },
        { name: "run_sql", input: { query: "SELECT o.name, count(*) FILTER (WHERE e.created_at > now() - interval '30 days') AS events_30d,\n       count(*) FILTER (WHERE e.created_at BETWEEN now() - interval '60 days' AND now() - interval '30 days') AS events_prev\nFROM events e JOIN orgs o ON o.id = e.org_id\nWHERE o.name IN ('Acme Logistics','Globex','Stark Retail','Initech','Hooli') GROUP BY 1;" }, result: [{ name: "Acme Logistics", events_30d: 18420, events_prev: 17990 }, { name: "Globex", events_30d: 9310, events_prev: 9800 }, { name: "Stark Retail", events_30d: 12050, events_prev: 11200 }, { name: "Initech", events_30d: 3120, events_prev: 8740 }, { name: "Hooli", events_30d: 7400, events_prev: 6900 }] },
      ] },
    ],
    final: "| Account | Revenue (QTD) | Usage vs. previous 30 days |\n|---|---|---|\n| Acme Logistics | $48,200 | +2% |\n| Globex | $39,650 | -5% |\n| Stark Retail | $31,100 | +8% |\n| Initech | $27,480 | **-64%** |\n| Hooli | $22,900 | +7% |\n\n**Initech is at risk**: usage fell by almost two thirds in a month while they still pay $27k a quarter - that pattern usually comes before a cancellation. I'd ask their CSM to reach out this week. Everyone else is stable or growing.",
  }),
];

// ── SRE agent (Vercel AI SDK) ─────────────────────────────────────────────────

export const SRE_SYSTEM = "You are the on-call assistant. Investigate alerts with the observability tools, find the most likely root cause, and propose an immediate mitigation plus a follow-up. Quote the evidence (metric values, log lines).";

export const SRE_TOOLS: ToolDef[] = [
  { name: "get_alert", description: "Details of a firing alert.", parameters: obj({ alert_id: { type: "string" } }, ["alert_id"]) },
  { name: "query_metrics", description: "PromQL query over a time range.", parameters: obj({ promql: { type: "string" }, range: { type: "string" } }, ["promql"]) },
  { name: "search_logs", description: "Search logs (LogQL-like) and return the top matching lines.", parameters: obj({ query: { type: "string" }, limit: { type: "integer" } }, ["query"]) },
  { name: "list_deploys", description: "Recent deployments of a service.", parameters: obj({ service: { type: "string" } }, ["service"]) },
];

export const sreScripts: Array<() => AgentScript> = [
  () => ({
    user: "PagerDuty: `export-worker memory > 90%` is firing again. Third time this week. What's going on?",
    turns: [
      { calls: [{ name: "get_alert", input: { alert_id: `PD-${randInt(10000, 99999)}` }, result: { service: "export-worker", condition: "container_memory_working_set_bytes / limit > 0.9", for: "10m", pods: 3 } }] },
      { calls: [
        { name: "query_metrics", input: { promql: "container_memory_working_set_bytes{container=\"export-worker\"}", range: "24h" }, result: { pattern: "sawtooth", start_mb: 410, peak_mb: 1890, limit_mb: 2048, restarts_24h: 4 } },
        { name: "list_deploys", input: { service: "export-worker" }, result: [{ version: "v2.4.1", deployed: isoDate(ago(4 * DAY)), change: "scheduled exports (S3, e-mail)" }] },
      ] },
      { calls: [{ name: "search_logs", input: { query: "{service=\"export-worker\"} |= \"export finished\" | json | rows > 100000", limit: 3 }, result: ["export finished org=acme rows=812004 duration=184s buffer=full", "export finished org=globex rows=402118 duration=91s buffer=full", "export finished org=initech rows=156332 duration=33s buffer=full"] }] },
    ],
    final: "**Likely cause:** the scheduled exports shipped 4 days ago (v2.4.1) build the whole CSV in memory (`buffer=full` in the logs). Memory climbs to ~1.9 GB of 2 GB during large exports (Acme: 812k rows) and the pod restarts - a sawtooth with 4 restarts in 24 h.\n\n**Mitigate now:** cap scheduled exports at 1 concurrent job per pod, or raise the limit to 3 GB temporarily.\n\n**Fix:** stream rows to S3 with a multipart upload instead of buffering. Memory then stays flat no matter how big the export is.",
  }),
  () => ({
    user: "API p95 jumped from 200ms to 3s about 20 minutes ago. Help!",
    turns: [
      { calls: [{ name: "query_metrics", input: { promql: "histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))", range: "1h" }, result: { all_routes_affected: true, p95_before_ms: 210, p95_now_ms: 3100, started: "20 min ago" } }] },
      { calls: [
        { name: "query_metrics", input: { promql: "pgbouncer_pools_client_waiting_connections", range: "1h" }, result: { before: 0, now: 148 } },
        { name: "search_logs", input: { query: "{service=\"api\"} |= \"timeout\"", limit: 3 }, result: ["acquire connection timeout after 2000ms pool=main", "acquire connection timeout after 2000ms pool=main", "slow query 28.4s: SELECT ... FROM events WHERE org_id = $1 ORDER BY created_at"] },
      ] },
      { calls: [{ name: "search_logs", input: { query: "{service=\"api\"} |= \"slow query\" | json | duration > 10s", limit: 2 }, result: ["slow query 28.4s route=/reports/activity org=acme", "slow query 31.0s route=/reports/activity org=acme"] }] },
    ],
    final: "**Cause:** connection pool exhaustion. 148 clients are waiting for a database connection (0 normally). The pool is held by **slow queries from `/reports/activity` for Acme** (28-31 s each), so every other route waits for a connection too - which is why all endpoints got slower.\n\n**Mitigate now:** set a 5 s `statement_timeout` for the reports role, or temporarily turn off `/reports/activity` for that org.\n\n**Follow-up:** that query sorts the whole `events` table per org - an index on `events (org_id, created_at DESC)` should take it to milliseconds.",
  }),
  () => ({
    user: "Checkout errors are up - Sentry shows lots of `ETIMEDOUT` from the tax service. Is it us or them?",
    turns: [
      { calls: [
        { name: "query_metrics", input: { promql: "sum(rate(http_client_requests_total{target=\"taxjar\",status=\"error\"}[5m]))", range: "2h" }, result: { error_rate_before: 0.002, error_rate_now: 0.31, started: "47 min ago" } },
        { name: "list_deploys", input: { service: "checkout" }, result: [{ version: "v5.12.0", deployed: isoDate(ago(6 * DAY)) }] },
      ] },
      { calls: [{ name: "search_logs", input: { query: "{service=\"checkout\"} |= \"taxjar\"", limit: 3 }, result: ["taxjar POST /v2/taxes ETIMEDOUT after 10000ms", "taxjar status page: 'Elevated API latency in US-East' (investigating)", "taxjar POST /v2/taxes ETIMEDOUT after 10000ms"] }] },
    ],
    final: "**It's them.** 31% of calls to the tax provider are failing (0.2% normally), starting 47 minutes ago. Their status page reports *\"Elevated API latency in US-East\"*, and we haven't deployed checkout for 6 days.\n\n**Mitigate now:** turn on the `tax_fallback_estimate` flag - checkout then uses cached tax rates and marks orders for recalculation, instead of failing.\n\n**Follow-up:** our 10 s timeout keeps users waiting on a spinner. Use a 2 s timeout with an automatic fallback, so the next outage of theirs won't affect checkout.",
  }),
];

// ── travel assistant (OpenAI, parallel tool calls) ────────────────────────────

export const TRAVEL_SYSTEM = "You are a travel assistant for business travellers. Be brief and practical. Prices in EUR. Never book without the traveller's explicit confirmation - holding a seat is fine.";

export const TRAVEL_TOOLS: ToolDef[] = [
  { name: "get_weather", description: "Daily forecast for a city.", parameters: obj({ city: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 7 } }, ["city"]) },
  { name: "search_flights", description: "Search flights between two airports.", parameters: obj({ from: { type: "string" }, to: { type: "string" }, date: { type: "string" }, depart_after: { type: "string" }, direct_only: { type: "boolean" } }, ["from", "to", "date"]) },
  { name: "search_hotels", description: "Hotels near an address.", parameters: obj({ near: { type: "string" }, nights: { type: "integer" }, max_price_eur: { type: "integer" } }, ["near", "nights"]) },
  { name: "hold_seat", description: "Hold a seat for 24 h without paying.", parameters: obj({ flight: { type: "string" } }, ["flight"]) },
];

const TRIPS = [
  { city: "Berlin", iata: "BER", venue: "bcc Berlin Congress Center", flights: [["KL1776", "17:45", "19:10", 142], ["EW9172", "19:30", "20:50", 96]] },
  { city: "Lisbon", iata: "LIS", venue: "FIL, Parque das Nações", flights: [["TP668", "18:10", "22:40", 188], ["KL1694", "19:55", "00:20", 164]] },
  { city: "Copenhagen", iata: "CPH", venue: "Bella Center", flights: [["SK551", "17:20", "18:45", 131], ["KL1132", "20:05", "21:30", 118]] },
] as const;

export const travelScripts: Array<() => AgentScript> = [
  () => {
    const t = pick(TRIPS); const [f1, f2] = t.flights;
    const hotel = { name: `Hotel ${pick(["Nord", "Mercator", "Park", "Central"])}`, walk_min: randInt(4, 12), price_eur: randInt(120, 190), rating: 8.6 };
    const weather = [
      { day: "Tuesday", high_c: randInt(8, 18), low_c: randInt(2, 7), summary: pick(["light rain", "cloudy", "sunny intervals"]) },
      { day: "Wednesday", high_c: randInt(8, 18), low_c: randInt(2, 7), summary: pick(["windy", "sunny", "showers"]) },
    ] as const;
    return {
      user: `I'm speaking at a conference at ${t.venue} on Tuesday, staying one night. Find me a hotel within walking distance under €200, check the weather, and hold the cheaper direct flight back to Amsterdam on Wednesday evening.`,
      turns: [
        { calls: [
          { name: "get_weather", input: { city: t.city, days: 2 }, result: weather },
          { name: "search_hotels", input: { near: t.venue, nights: 1, max_price_eur: 200 }, result: [hotel] },
          { name: "search_flights", input: { from: t.iata, to: "AMS", date: "wednesday", depart_after: "17:00", direct_only: true }, result: t.flights.map(([flight, dep, arr, price]) => ({ flight, depart: dep, arrive: arr, price_eur: price })) },
        ] },
        { say: `${f2[0]} is the cheaper direct option - holding it.`, calls: [{ name: "hold_seat", input: { flight: f2[0] }, result: { ok: true, hold_id: `H-${rid(6)}`, expires_in_hours: 24, price_eur: f2[3] } }] },
      ],
      final: `Here's your trip to ${t.city}:\n\n**Hotel:** ${hotel.name} - ${hotel.walk_min} min walk to ${t.venue}, €${hotel.price_eur} for the night, rated ${hotel.rating}.\n\n**Flight back (Wednesday):** I've **held ${f2[0]}** (${f2[1]} → ${f2[2]}, €${f2[3]}) for 24 h - nothing is paid yet. The other direct option is ${f1[0]} at ${f1[1]} for €${f1[3]} if you need to leave earlier.\n\n**Weather:** Tuesday ${weather[0].low_c}-${weather[0].high_c} °C, ${weather[0].summary}; Wednesday ${weather[1].low_c}-${weather[1].high_c} °C, ${weather[1].summary}.\n\nReply \"book it\" and I'll book the hotel and confirm the flight.`,
    };
  },
];
