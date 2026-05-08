import { describe, expect, test } from "bun:test";
import { createAgentRun } from "./agent-runs";
import type { Database } from "./client";

type Recorded = {
  strings: TemplateStringsArray;
  values: unknown[];
};

type ArrayMarker = { __array: true; values: unknown[]; type: unknown };

function fakeDatabase(rowsToReturn: unknown[] = []) {
  const recorded: Recorded[] = [];

  const tag = (strings: TemplateStringsArray, ...values: unknown[]) => {
    recorded.push({ strings, values });
    return Promise.resolve(rowsToReturn);
  };

  const arrayHelper = (values: unknown[], type?: unknown): ArrayMarker => ({
    __array: true,
    values,
    type,
  });

  Object.defineProperty(tag, "array", { value: arrayHelper });

  return { tag: tag as unknown as Database, recorded };
}

describe("createAgentRun array binding", () => {
  test("binds selected_agents via sql.array with TEXT type", async () => {
    const { tag, recorded } = fakeDatabase([
      {
        id: "fake-id",
        conversation_id: null,
        router_decision: "knowledge",
        selected_agents: ["knowledge"],
        model: "gpt-test",
        status: "running",
        latency_ms: null,
        input_tokens: null,
        output_tokens: null,
        error: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    await createAgentRun(
      {
        conversationId: null,
        routerDecision: "knowledge",
        selectedAgents: ["knowledge"],
        model: "gpt-test",
      },
      tag,
    );

    expect(recorded.length).toBe(1);
    const arrayParam = recorded[0]!.values[2] as ArrayMarker;
    expect(arrayParam.__array).toBe(true);
    expect(arrayParam.values).toEqual(["knowledge"]);
    expect(arrayParam.type).toBe("TEXT");
  });

  test("binds an empty selected_agents array via sql.array", async () => {
    const { tag, recorded } = fakeDatabase([]);

    await createAgentRun({}, tag);

    const arrayParam = recorded[0]!.values[2] as ArrayMarker;
    expect(arrayParam.__array).toBe(true);
    expect(arrayParam.values).toEqual([]);
    expect(arrayParam.type).toBe("TEXT");
  });
});
