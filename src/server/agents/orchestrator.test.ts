import { describe, expect, test } from "bun:test";
import { runSwarm } from "./orchestrator";

const request = {
  challengeUserId: "client789",
  authenticatedUserId: "user_test",
  requestId: "req_test",
};

describe("swarm orchestrator", () => {
  test("requires LLM configuration", async () => {
    const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
    const previousOpenAiModel = process.env.OPENAI_MODEL;
    const previousGatewayApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousGatewayModel = process.env.AI_GATEWAY_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_MODEL;

    await expectRequiredConfigError(
      runSwarm(
        {
          ...request,
          message: "What are the fees of the Maquininha Smart?",
        },
        { persist: false },
      ),
    );

    restoreEnv("OPENAI_API_KEY", previousOpenAiApiKey);
    restoreEnv("OPENAI_MODEL", previousOpenAiModel);
    restoreEnv("AI_GATEWAY_API_KEY", previousGatewayApiKey);
    restoreEnv("AI_GATEWAY_MODEL", previousGatewayModel);
  });
});

async function expectRequiredConfigError(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected swarm to require LLM configuration.");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("LLM configuration is required");
  }
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
