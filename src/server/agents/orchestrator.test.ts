import { describe, expect, test } from "bun:test";
import { runSwarm } from "./orchestrator";

const request = {
  challengeUserId: "client789",
  authenticatedUserId: "user_test",
  requestId: "req_test",
};

describe("swarm orchestrator", () => {
  test("returns a fallback knowledge response without AI Gateway config", async () => {
    const result = await runSwarm(
      {
        ...request,
        message: "What are the fees of the Maquininha Smart?",
      },
      { persist: false, modelConfig: null },
    );

    expect(result.route.category).toBe("knowledge");
    expect(result.response).toContain("Knowledge Agent");
    expect(result.conversationId).toBeNull();
    expect(result.agentRunId).toBeNull();
  });

  test("returns a fallback support response without persistence", async () => {
    const result = await runSwarm(
      {
        ...request,
        message: "I can't sign in to my account.",
      },
      { persist: false, modelConfig: null },
    );

    expect(result.route.category).toBe("support");
    expect(result.response).toContain("Customer Support Agent");
    expect(result.handoffRequired).toBeFalse();
  });

  test("combines sequential fallback agent responses", async () => {
    const result = await runSwarm(
      {
        ...request,
        message: "My Pix transfer failed, what are InfinitePay Pix limits?",
      },
      { persist: false, modelConfig: null },
    );

    expect(result.route.selectedAgents).toEqual(["support", "knowledge"]);
    expect(result.response).toContain("Customer Support Agent");
    expect(result.response).toContain("Knowledge Agent");
  });

  test("marks explicit handoff routes in fallback mode", async () => {
    const result = await runSwarm(
      {
        ...request,
        message: "I need to speak to a human about my blocked account",
      },
      { persist: false, modelConfig: null },
    );

    expect(result.route.category).toBe("handoff");
    expect(result.handoffRequired).toBeTrue();
  });
});
