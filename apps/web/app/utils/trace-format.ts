import { escHtml } from "./json-highlight";
import type { UnifiedTrace } from "@llm-lens/types";

export function fmtN(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
  return v.toString();
}

export function fmtMs(v: number | null | undefined): string {
  if (!v) return "—";
  return v >= 1000 ? (v / 1000).toFixed(2) + "s" : v + "ms";
}

export function fmtUsd(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v < 0.0001) return "<$0.0001";
  if (v < 0.01) return "$" + v.toFixed(4);
  if (v < 1) return "$" + v.toFixed(3);
  return "$" + v.toFixed(2);
}

export function latClass(ms: number | null | undefined): string {
  if (!ms) return "";
  if (ms >= 5000) return "slow";
  if (ms >= 1500) return "warn";
  return "";
}

export function formatDate(ts: string | number): string {
  return new Date(ts).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function getRelative(ts: string | number): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Minimal markdown (bold + line breaks) for v-html - the text is HTML-escaped first */
export function renderMd(text: string): string {
  return escHtml(text)
    .split("\n")
    .map(line => line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"))
    .join("<br>");
}

export function traceName(t: UnifiedTrace): string {
  if (t.metadata.name) return t.metadata.name;
  return `${t.metadata.model.split("/").pop()!.split("-")[0]}_${t.id.slice(-8)}`;
}

/** Short failure label for list markers, e.g. "429" or "ERR" - null for successful traces */
export function errorMarker(t: UnifiedTrace): string | null {
  const code = t.metadata.statusCode ?? 200;
  if (!t.metadata.error && code < 400) return null;
  return code >= 400 && code !== 599 ? String(code) : "ERR";
}

export function toolCallCount(t: UnifiedTrace): number {
  return t.messages.reduce((s, m) => s + (m.toolCalls?.length ?? 0), 0);
}

export function hasSystem(t: UnifiedTrace): boolean {
  return t.messages.some(m => m.role === "system");
}

export function traceStatus(t: UnifiedTrace): { ok: boolean; label: string } {
  const code = t.metadata.statusCode ?? 200;
  if (t.metadata.error || code >= 400) {
    if (code === 599) return { ok: false, label: "Network error" };
    return { ok: false, label: `${code} ${t.metadata.errorCode ?? "Error"}` };
  }
  return { ok: code < 400, label: `${code} ${code < 400 ? "OK" : "Error"}` };
}
