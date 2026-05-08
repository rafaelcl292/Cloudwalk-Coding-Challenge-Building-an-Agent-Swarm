import { describe, expect, test } from "bun:test";
import { scoreKnowledgeChunk } from "./knowledge";

describe("knowledge retrieval scoring", () => {
  test("scores matching chunks above unrelated chunks", () => {
    const query = "How can I use my phone as a card machine?";
    const matching = scoreKnowledgeChunk(
      query,
      "InfinitePay Tap to Pay lets merchants use a phone as a card machine.",
    );
    const unrelated = scoreKnowledgeChunk(query, "Boleto payment links for online stores.");

    expect(matching).toBeGreaterThan(unrelated);
    expect(unrelated).toBeGreaterThanOrEqual(0);
  });
});
