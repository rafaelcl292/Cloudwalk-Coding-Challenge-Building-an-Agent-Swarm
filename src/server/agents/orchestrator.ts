import {
  appendMessage,
  createAgentRun,
  createConversation,
  finishAgentRun,
  recordToolCall,
  upsertUser,
} from "../db";
import { createGuardrailsAgent } from "./guardrails-agent";
import { createKnowledgeAgent } from "./knowledge-agent";
import { getAgentModelConfig, type AgentModelConfig } from "./model";
import { createRouterAgent } from "./router-agent";
import type { AgentAnswer, AgentName, RoutePlan, SwarmRequest, SwarmResult } from "./schemas";
import { createSupportAgent } from "./support-agent";

export type RunSwarmOptions = {
  persist?: boolean;
  modelConfig?: AgentModelConfig;
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
        model: modelConfig.modelId,
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

async function planRoute(message: string, modelConfig: AgentModelConfig): Promise<RoutePlan> {
  const router = createRouterAgent(modelConfig);
  const result = await router.generate({
    prompt: `User message: ${message}`,
  });

  return result.output;
}

async function runSelectedAgents(
  input: SwarmRequest,
  route: RoutePlan,
  modelConfig: AgentModelConfig,
  agentRunId: string | null,
): Promise<AgentAnswer> {
  const answers: AgentAnswer[] = [];

  for (const agentName of route.selectedAgents) {
    const answer = await runAgent(agentName, input, route, modelConfig, agentRunId, answers);
    answers.push(answer);

    if (answer.handoffRequired || route.category === "blocked") {
      break;
    }
  }

  return combineAgentAnswers(answers);
}

async function runAgent(
  agentName: AgentName,
  input: SwarmRequest,
  route: RoutePlan,
  modelConfig: AgentModelConfig,
  agentRunId: string | null,
  previousAnswers: AgentAnswer[],
): Promise<AgentAnswer> {
  if (agentName === "guardrails") {
    const result = await createGuardrailsAgent(modelConfig).generate({
      prompt: input.message,
    });

    return result.output;
  }

  if (agentName === "support") {
    const result = await createSupportAgent(modelConfig, { agentRunId }).generate({
      prompt: `User message: ${input.message}
Challenge customer id: ${input.challengeUserId}
Authenticated Clerk user id: ${input.authenticatedUserId}
Route plan: ${JSON.stringify(route)}
Prior agent answers: ${JSON.stringify(previousAnswers)}`,
    });

    return result.output;
  }

  if (agentName === "knowledge") {
    const result = await createKnowledgeAgent(modelConfig).generate({
      prompt: `User message: ${input.message}
Route plan: ${JSON.stringify(route)}
Prior agent answers: ${JSON.stringify(previousAnswers)}`,
    });

    return result.output;
  }

  const unreachableAgent: never = agentName;
  throw new Error(`Unsupported agent selected by router: ${String(unreachableAgent)}`);
}

function combineAgentAnswers(answers: AgentAnswer[]): AgentAnswer {
  return {
    answer: answers.map((answer) => answer.answer).join("\n\n"),
    sources: [...new Set(answers.flatMap((answer) => answer.sources))],
    handoffRequired: answers.some((answer) => answer.handoffRequired),
    handoffReason: answers.find((answer) => answer.handoffReason)?.handoffReason ?? null,
  };
}
