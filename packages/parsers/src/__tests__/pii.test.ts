import { describe, it, expect } from "vitest";
import { maskPII, maskPIIDeep } from "../pii.js";

describe("maskPII", () => {
  it("masks e-mail addresses", () => {
    expect(maskPII("write to jan.kowalski@example.com please")).toBe("write to [email] please");
  });

  it("masks phone numbers in common formats", () => {
    expect(maskPII("call +48 600 700 800")).toBe("call [phone]");
    expect(maskPII("tel. 600-700-800")).toBe("tel. [phone]");
    expect(maskPII("numer 600700800")).toBe("numer [phone]");
  });

  it("masks Luhn-valid card numbers only", () => {
    expect(maskPII("card 4111 1111 1111 1111")).toBe("card [card]");
    expect(maskPII("order 1234 5678 9012 3456")).not.toContain("[card]");
  });

  it("leaves timestamps, dates and amounts alone", () => {
    expect(maskPII("ts 1715700000000")).toBe("ts 1715700000000");
    expect(maskPII("on 2026-10-27 at 22:50")).toBe("on 2026-10-27 at 22:50");
    expect(maskPII("200 g flour, 2 eggs, 1.5 l milk")).toBe("200 g flour, 2 eggs, 1.5 l milk");
  });

  it("masks nested values but keeps ids", () => {
    const masked = maskPIIDeep({ id: "a@b.co", messages: [{ content: "me: a@b.co" }], n: 5 });
    expect(masked).toEqual({ id: "a@b.co", messages: [{ content: "me: [email]" }], n: 5 });
  });
});
