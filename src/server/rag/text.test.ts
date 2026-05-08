import { describe, expect, test } from "bun:test";
import { chunkText, extractTitle, normalizeHtml } from "./text";

describe("rag text helpers", () => {
  test("extracts title and readable text from html", () => {
    const html =
      "<html><head><title>InfinitePay &amp; Maquininha</title><style>.x{}</style></head><body><h1>Tap to Pay</h1><script>alert(1)</script><p>Receba na hora.</p></body></html>";

    expect(extractTitle(html)).toBe("InfinitePay & Maquininha");
    expect(normalizeHtml(html)).toBe("Tap to Pay Receba na hora.");
  });

  test("chunks text with overlap", () => {
    const chunks = chunkText("one two three four five six", 4, 1);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.text).toBe("one two three four");
    expect(chunks[1]?.text).toBe("four five six");
  });
});
