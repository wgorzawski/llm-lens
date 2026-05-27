export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function highlightJson(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null) return '<span class="j-null">null</span>';
  if (typeof obj === "boolean") return `<span class="j-bool">${obj}</span>`;
  if (typeof obj === "number") return `<span class="j-num">${obj}</span>`;
  if (typeof obj === "string") {
    const escaped = escHtml(obj).replace(/\n/g, "\\n").replace(/\t/g, "\\t");
    return `<span class="j-str">"${escaped}"</span>`;
  }
  if (Array.isArray(obj)) {
    if (!obj.length) return '<span class="j-punct">[]</span>';
    const items = obj.map((v, i) =>
      `${"  ".repeat(indent + 1)}${highlightJson(v, indent + 1)}${i < obj.length - 1 ? '<span class="j-punct">,</span>' : ""}\n`
    ).join("");
    return `<span class="j-punct">[</span>\n${items}${pad}<span class="j-punct">]</span>`;
  }
  if (typeof obj === "object" && obj !== null) {
    const keys = Object.keys(obj as Record<string, unknown>);
    if (!keys.length) return '<span class="j-punct">{}</span>';
    const items = keys.map((k, i) => {
      const v = (obj as Record<string, unknown>)[k];
      return `${"  ".repeat(indent + 1)}<span class="j-key">"${escHtml(k)}"</span><span class="j-punct">: </span>${highlightJson(v, indent + 1)}${i < keys.length - 1 ? '<span class="j-punct">,</span>' : ""}\n`;
    }).join("");
    return `<span class="j-punct">{</span>\n${items}${pad}<span class="j-punct">}</span>`;
  }
  return escHtml(String(obj));
}
