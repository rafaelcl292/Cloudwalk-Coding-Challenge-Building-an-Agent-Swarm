import {
  appendMessage,
  createAgentRun,
  createConversation,
  finishAgentRun,
  getConversationForUser,
  listConversationMessages,
  recordToolCall,
  upsertUser,
} from "../db";
import type { MessageRow } from "../db/types";
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
  let history: MessageRow[] = [];

  try {
    if (persist) {
      const user = await upsertUser({ clerkUserId: input.authenticatedUserId });
      const conversation =
        user && input.conversationId
          ? await getConversationForUser(input.conversationId, user.id)
          : user
            ? await createConversation({
                ownerUserId: user.id,
                title: input.message.slice(0, 80),
              })
            : null;

      conversationId = conversation?.id ?? null;

      if (user && input.conversationId && !conversationId) {
        throw new Error("Conversation not found for authenticated user.");
      }

      if (conversationId) {
        history = await listConversationMessages(conversationId);
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

    const route = await planRoute(input.message, modelConfig, history);

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

    const answer = await runSelectedAgents(input, route, modelConfig, agentRunId, history);
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
          latencyMs,
          agentRunId,
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
    console.error("[swarm] orchestration failed", {
      requestId: input.requestId,
      challengeUserId: input.challengeUserId,
      authenticatedUserId: input.authenticatedUserId,
      conversationId,
      agentRunId,
      error,
    });

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
  modelConfig: AgentModelConfig,
  history: MessageRow[],
): Promise<RoutePlan> {
  const router = createRouterAgent(modelConfig);
  const result = await router.generate({
    prompt: `Conversation history:
${formatMessageHistory(history)}

Current user message: ${message}`,
  });

  return result.output;
}

async function runSelectedAgents(
  input: SwarmRequest,
  route: RoutePlan,
  modelConfig: AgentModelConfig,
  agentRunId: string | null,
  history: MessageRow[],
): Promise<AgentAnswer> {
  const answers: AgentAnswer[] = [];

  for (const agentName of route.selectedAgents) {
    const answer = await runAgent(
      agentName,
      input,
      route,
      modelConfig,
      agentRunId,
      answers,
      history,
    );
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
  history: MessageRow[],
): Promise<AgentAnswer> {
  if (agentName === "guardrails") {
    const result = await createGuardrailsAgent(modelConfig).generate({
      prompt: input.message,
    });

    return result.output;
  }

  if (agentName === "support") {
    const result = await createSupportAgent(modelConfig, { agentRunId }).generate({
      prompt: `Conversation history:
${formatMessageHistory(history)}

User message: ${input.message}
Challenge customer id: ${input.challengeUserId}
Authenticated Clerk user id: ${input.authenticatedUserId}
Route plan: ${JSON.stringify(route)}
Prior agent answers: ${JSON.stringify(previousAnswers)}`,
    });

    return result.output;
  }

  if (agentName === "knowledge") {
    const result = await createKnowledgeAgent(modelConfig).generate({
      prompt: `Conversation history:
${formatMessageHistory(history)}

User message: ${input.message}
Route plan: ${JSON.stringify(route)}
Prior agent answers: ${JSON.stringify(previousAnswers)}`,
    });

    return result.output;
  }

  const unreachableAgent: never = agentName;
  throw new Error(`Unsupported agent selected by router: ${String(unreachableAgent)}`);
}

function formatMessageHistory(messages: MessageRow[]) {
  if (messages.length === 0) return "(none)";

  return messages
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function combineAgentAnswers(answers: AgentAnswer[]): AgentAnswer {
  return {
    answer: answers.map((answer) => answer.answer).join("\n\n"),
    sources: [...new Set(answers.flatMap((answer) => answer.sources))],
    handoffRequired: answers.some((answer) => answer.handoffRequired),
    handoffReason: answers.find((answer) => answer.handoffReason)?.handoffReason ?? null,
  };
}
