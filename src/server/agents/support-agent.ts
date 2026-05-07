import { Output, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import {
  getCustomerProfileByExternalId,
  getOpenTickets,
  getRecentTransactions,
  recordToolCall,
} from "../db";
import type { JsonValue } from "../db";
import { agentAnswerSchema, type AgentAnswer } from "./schemas";
import type { AgentModelConfig } from "./model";

type ToolContext = {
  agentRunId?: string | null;
};

export function createSupportAgent(config: AgentModelConfig, context: ToolContext = {}) {
  return new ToolLoopAgent({
    id: "support-agent",
    model: config.model,
    experimental_context: context,
    output: Output.object({
      schema: agentAnswerSchema,
      name: "support_answer",
      description: "An account-aware support answer.",
    }),
    tools: {
      getCustomerProfile: tool({
        description: "Fetch an InfinitePay customer profile by external challenge customer id.",
        inputSchema: z.object({
          externalCustomerId: z.string().min(1),
        }),
        execute: async (input, options) =>
          trackTool("getCustomerProfile", input, options.experimental_context, async () => {
            const profile = await getCustomerProfileByExternalId(input.externalCustomerId);

            return { profile };
          }),
      }),
      getRecentTransactions: tool({
        description:
          "Fetch recent transactions and failure reasons for a known customer profile id.",
        inputSchema: z.object({
          customerId: z.string().min(1),
          limit: z.number().int().min(1).max(20).default(5),
        }),
        execute: async (input, options) =>
          trackTool("getRecentTransactions", input, options.experimental_context, async () => {
            const transactions = await getRecentTransactions(input.customerId, input.limit);

            return { transactions };
          }),
      }),
      getOpenTickets: tool({
        description: "Fetch open support tickets for a known customer profile id.",
        inputSchema: z.object({
          customerId: z.string().min(1),
        }),
        execute: async (input, options) =>
          trackTool("getOpenTickets", input, options.experimental_context, async () => {
            const tickets = await getOpenTickets(input.customerId);

            return { tickets };
          }),
      }),
    },
    instructions: `You are the Customer Support Agent.
Use customer tools before making account-specific claims. The user's challenge customer id is available in the prompt; pass it to getCustomerProfile as externalCustomerId.
If account status is blocked, review, identity-sensitive, or data is missing, explain that human handoff is required instead of inventing a resolution.
Keep responses direct and mention which customer data informed the answer.`,
  });
}

export function createSupportFallbackAnswer(challengeUserId: string): AgentAnswer {
  return {
    answer: `I routed this to the Customer Support Agent for customer ${challengeUserId}. AI Gateway is not configured, so the LLM support agent did not run; the next support step can use the seeded customer profile and transaction tools for this user.`,
    sources: [],
    handoffRequired: false,
    handoffReason: null,
  };
}

async function trackTool<TInput extends Record<string, unknown>, TOutput>(
  toolName: string,
  input: TInput,
  context: unknown,
  execute: () => Promise<TOutput>,
) {
  const startedAt = performance.now();
  const agentRunId = readToolContext(context).agentRunId;

  try {
    const output = await execute();

    if (agentRunId) {
      await recordToolCall({
        agentRunId,
        toolName,
        input: toJsonValue(input),
        output: toJsonValue(output),
        durationMs: Math.round(performance.now() - startedAt),
      });
    }

    return output;
  } catch (error) {
    if (agentRunId) {
      await recordToolCall({
        agentRunId,
        toolName,
        input: toJsonValue(input),
        error: error instanceof Error ? error.message : "Unknown tool error",
        durationMs: Math.round(performance.now() - startedAt),
      });
    }

    throw error;
  }
}

function readToolContext(context: unknown): ToolContext {
  if (!context || typeof context !== "object") {
    return {};
  }

  return context as ToolContext;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
