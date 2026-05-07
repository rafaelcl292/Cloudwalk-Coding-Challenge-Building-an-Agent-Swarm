import {
  appendMessage,
  createAgentRun,
  createConversation,
  finishAgentRun,
  recordToolCall,
  upsertUser,
} from "../db";
import { createGeneralWebAgent, createGeneralWebFallbackAnswer } from "./general-web-agent";
import { createBlockedFallbackAnswer, createGuardrailsAgent } from "./guardrails-agent";
import { createKnowledgeAgent, createKnowledgeFallbackAnswer } from "./knowledge-agent";
import { getAgentModelConfig } from "./model";
import { createHeuristicRoutePlan, createRouterAgent } from "./router-agent";
import type { AgentAnswer, RoutePlan, SwarmRequest, SwarmResult } from "./schemas";
import { createSupportAgent, createSupportFallbackAnswer } from "./support-agent";

export type RunSwarmOptions = {
  persist?: boolean;
  modelConfig?: ReturnType<typeof getAgentModelConfig>;
};

export async function runSwarm(
  input: SwarmRequest,
  options: RunSwarmOptions = {},
): Promise<SwarmResult> {
  const persist = options.persist ?? true;
  const modelConfig =
    options.modelConfig === undefined ? getAgentModelConfig() : options.modelConfig;
  const startedAt = performance.now();
  let conversationId: string | null = null;
  let agentRunId: string | null = null;

  try {
    if (persist) {
      const user = await upsertUser({ clerkUserId: input.authenticatedUserId });
      const conversation = user
        ? await createConversation({
            ownerUserId: user.id,
            title: input.message.slice(0, 80),
          })
        : null;

      conversationId = conversation?.id ?? null;

      if (conversationId) {
        await appendMessage({
          conversationId,
          role: "user",
          content: input.message,
          metadata: {
            challengeUserId: input.challengeUserId,
            requestId: input.requestId,
          },
        });
      }
    }

    const route = await planRoute(input.message, modelConfig);

    if (persist) {
      const run = await createAgentRun({
        conversationId,
        routerDecision: route.category,
        selectedAgents: route.selectedAgents,
        model: modelConfig?.modelId ?? null,
      });

      agentRunId = run?.id ?? null;

      if (agentRunId) {
        await recordToolCall({
          agentRunId,
          toolName: "router_decision",
          input: {
            message: input.message,
            challengeUserId: input.challengeUserId,
          },
          output: route,
        });
      }
    }

    const answer = await runSelectedAgents(input, route, modelConfig, agentRunId);
    const latencyMs = Math.round(performance.now() - startedAt);

    if (persist && conversationId) {
      await appendMessage({
        conversationId,
        role: "assistant",
        content: answer.answer,
        metadata: {
          route,
          sources: answer.sources,
          handoffRequired: answer.handoffRequired,
          handoffReason: answer.handoffReason,
        },
      });
    }

    if (persist && agentRunId) {
      await finishAgentRun({
        id: agentRunId,
        status: "succeeded",
        latencyMs,
      });
    }

    return {
      response: answer.answer,
      route,
      conversationId,
      agentRunId,
      sources: answer.sources,
      handoffRequired: answer.handoffRequired,
    };
  } catch (error) {
    if (persist && agentRunId) {
      await finishAgentRun({
        id: agentRunId,
        status: "failed",
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : "Unknown swarm error",
      });
    }

    throw error;
  }
}

async function planRoute(
  message: string,
  modelConfig: ReturnType<typeof getAgentModelConfig>,
): Promise<RoutePlan> {
  if (!modelConfig) {
    return createHeuristicRoutePlan(message);
  }

  const router = createRouterAgent(modelConfig);
  const result = await router.generate({
    prompt: `User message: ${message}`,
  });

  return result.output;
}

async function runSelectedAgents(
  input: SwarmRequest,
  route: RoutePlan,
  modelConfig: ReturnType<typeof getAgentModelConfig>,
  agentRunId: string | null,
): Promise<AgentAnswer> {
  if (route.category === "blocked") {
    if (!modelConfig) {
      return createBlockedFallbackAnswer();
    }

    const result = await createGuardrailsAgent(modelConfig).generate({
      prompt: input.message,
    });

    return result.output;
  }

  if (route.category === "support") {
    if (!modelConfig) {
      return createSupportFallbackAnswer(input.challengeUserId);
    }

    const result = await createSupportAgent(modelConfig, { agentRunId }).generate({
      prompt: `User message: ${input.message}
Challenge customer id: ${input.challengeUserId}
Authenticated Clerk user id: ${input.authenticatedUserId}`,
    });

    return result.output;
  }

  if (route.category === "knowledge") {
    if (!modelConfig) {
      return createKnowledgeFallbackAnswer(input.message);
    }

    const result = await createKnowledgeAgent(modelConfig).generate({
      prompt: input.message,
    });

    return result.output;
  }

  if (!modelConfig) {
    return createGeneralWebFallbackAnswer();
  }

  const result = await createGeneralWebAgent(modelConfig).generate({
    prompt: input.message,
  });

  return result.output;
}
