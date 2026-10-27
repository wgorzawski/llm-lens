import { sendEmail } from "./email";

// Delivery of alerts and digests to the channels a user connected in Settings ->
// Notifications: e-mail (when SMTP is configured), Slack incoming webhook, PagerDuty
// (Events API v2 routing key) and the generic outbound webhook.

const DELIVERY_TIMEOUT_MS = 10_000;

export interface NotificationPrefs {
  slackWebhookUrl?: string;
  pagerdutyKey?: string;
  outboundWebhookUrl?: string;
}

export interface Notification {
  /** Stable id of the condition, e.g. "error_rate" - used for PagerDuty de-duplication */
  kind: string;
  title: string;
  /** Plain-text body */
  text: string;
  severity: "info" | "warning" | "critical";
  /** Link to the dashboard, if FRONTEND_URL is set */
  url?: string;
  data?: Record<string, unknown>;
}

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function sendSlack(url: string, n: Notification): Promise<void> {
  const icon = n.severity === "critical" ? ":rotating_light:" : n.severity === "warning" ? ":warning:" : ":information_source:";
  await post(url, { text: `${icon} *${n.title}*\n${n.text}${n.url ? `\n<${n.url}|Open LLM Lens>` : ""}` });
}

export async function sendPagerDuty(routingKey: string, n: Notification, userId: string): Promise<void> {
  await post("https://events.pagerduty.com/v2/enqueue", {
    routing_key: routingKey,
    event_action: "trigger",
    dedup_key: `llm-lens:${userId}:${n.kind}`,
    payload: {
      summary: `${n.title} - ${n.text.split("\n")[0]}`.slice(0, 1024),
      source: "llm-lens",
      severity: n.severity === "info" ? "info" : n.severity,
      custom_details: n.data ?? {},
    },
    ...(n.url ? { links: [{ href: n.url, text: "LLM Lens" }] } : {}),
  });
}

export async function sendWebhook(url: string, n: Notification): Promise<void> {
  await post(url, { event: n.kind === "test" ? "notification.test" : "alert", alert: n });
}

/**
 * Sends a notification to every connected channel. Returns the channels that got it and
 * the ones that failed; never throws.
 */
export async function notify(
  user: { id: string; email: string },
  prefs: NotificationPrefs,
  n: Notification,
  opts: { email?: boolean; pagerduty?: boolean } = { email: true, pagerduty: true }
): Promise<{ sent: string[]; failed: Array<{ channel: string; error: string }> }> {
  const jobs: Array<[string, Promise<unknown>]> = [];
  if (opts.email !== false) {
    jobs.push(["email", sendEmail(user.email, `[LLM Lens] ${n.title}`, `${n.text}${n.url ? `\n\n${n.url}` : ""}`).then((ok) => {
      if (!ok) throw new Error("SMTP is not configured");
    })]);
  }
  if (prefs.slackWebhookUrl) jobs.push(["slack", sendSlack(prefs.slackWebhookUrl, n)]);
  if (prefs.pagerdutyKey && opts.pagerduty !== false) jobs.push(["pagerduty", sendPagerDuty(prefs.pagerdutyKey, n, user.id)]);
  if (prefs.outboundWebhookUrl) jobs.push(["webhook", sendWebhook(prefs.outboundWebhookUrl, n)]);

  const results = await Promise.allSettled(jobs.map(([, job]) => job));
  const sent: string[] = [];
  const failed: Array<{ channel: string; error: string }> = [];
  results.forEach((r, i) => {
    const channel = jobs[i]![0];
    if (r.status === "fulfilled") sent.push(channel);
    else failed.push({ channel, error: (r.reason as Error)?.message ?? String(r.reason) });
  });
  return { sent, failed };
}
