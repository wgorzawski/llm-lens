// PII masking applied to trace payloads before they are stored. Deliberately simple and
// conservative: e-mail addresses, phone numbers and card numbers (Luhn-checked) only.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 13-19 digits, optionally separated by single spaces or dashes
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;
// international (+48 123 456 789) or 9+ digit local numbers with common separators
const PHONE_RE = /(?<![\w.])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]?\d{2,4}){2,4}(?![\w.])/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function looksLikePhone(match: string): boolean {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;
  // dates, times and version-like strings are not phone numbers
  if (/^\d{4}-\d{2}-\d{2}/.test(match)) return false;
  // a bare run of digits is only a phone number when it has the usual 9 digits -
  // longer runs are timestamps, ids or amounts
  if (/^\d+$/.test(match)) return digits.length === 9;
  return true;
}

/** Masks e-mail addresses, card numbers and phone numbers in a string */
export function maskPII(text: string): string {
  if (!text) return text;
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(CARD_RE, (m) => (luhnValid(m.replace(/\D/g, "")) ? "[card]" : m))
    .replace(PHONE_RE, (m) => (looksLikePhone(m) ? "[phone]" : m));
}

/** Returns a deep copy of a JSON-like value with PII masked in every string */
export function maskPIIDeep<T>(value: T): T {
  if (typeof value === "string") return maskPII(value) as T;
  if (Array.isArray(value)) return value.map((v) => maskPIIDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // ids and image data are left alone
      out[k] = k === "id" || k === "data" || k === "url" || k === "toolCallId" || k === "tool_call_id" ? v : maskPIIDeep(v);
    }
    return out as T;
  }
  return value;
}
