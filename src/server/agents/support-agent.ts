import { Output, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import {
  createSupportTicket,
  getCustomerProfileByExternalId,
  getOpenTickets,
  getRecentTransactions,
  recordToolCall,
} from "../db";
import type {
  CustomerProfileRow,
  CustomerTransactionRow,
  JsonValue,
  SupportTicketRow,
} from "../db";
import { agentAnswerSchema } from "./schemas";
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
      createSupportTicket: tool({
        description: "Create a support ticket when the customer needs human assistance.",
        inputSchema: z.object({
          customerId: z.string().min(1),
          subject: z.string().min(1),
          priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
          summary: z.string().min(1),
        }),
        execute: async (input, options) =>
          trackTool("createSupportTicket", input, options.experimental_context, async () => {
            const ticket = await createSupportTicket(input);

            return { ticket };
          }),
      }),
      summarizeAccountIssue: tool({
        description: "Summarize profile, transaction, and ticket signals for handoff decisions.",
        inputSchema: z.object({
          externalCustomerId: z.string().min(1),
        }),
        execute: async (input, options) =>
          trackTool("summarizeAccountIssue", input, options.experimental_context, async () => {
            const snapshot = await loadSupportSnapshot(input.externalCustomerId);
            const summary = summarizeAccountIssue(snapshot);

            return { ...summary, snapshot };
          }),
      }),
    },
    instructions: `You are the Customer Support Agent.
Use customer tools before making account-specific claims. The user's challenge customer id is available in the prompt; pass it to getCustomerProfile as externalCustomerId.
Use getCustomerProfile and summarizeAccountIssue first. Use getRecentTransactions when the profile exists and the user asks about payments, transfers, failures, or limits. Use getOpenTickets before creating a new ticket.
If account status is blocked, review, identity-sensitive, missing, or repeated failures are found, set handoffRequired and explain the handoff reason instead of inventing a resolution.
Keep responses direct and mention which customer data informed the answer.`,
  });
}

export type SupportSnapshot = {
  profile: CustomerProfileRow | null;
  transactions: CustomerTransactionRow[];
  tickets: SupportTicketRow[];
};

export function summarizeAccountIssue(snapshot: SupportSnapshot) {
  if (!snapshot.profile) {
    return {
      summary: "No customer profile was found for the supplied customer id.",
      handoffRequired: true,
      handoffReason: "Missing customer profile.",
    };
  }

  const failedTransactions = snapshot.transactions.filter(
    (transaction) => transaction.status === "failed",
  );
  const hasSensitiveFlag = snapshot.profile.support_flags.some((flag) =>
    ["identity_review", "chargeback_watch", "manual_review"].includes(flag),
  );

  if (snapshot.profile.account_status === "blocked") {
    return {
      summary: `The account is blocked on the ${snapshot.profile.plan} plan. Open tickets: ${snapshot.tickets.length}. Recent failed transactions: ${failedTransactions.length}. Human review is required before advising on transfers or account access.`,
      handoffRequired: true,
      handoffReason: "Blocked account requires human review.",
    };
  }

  if (snapshot.profile.account_status === "review" || hasSensitiveFlag) {
    return {
      summary: `The account is under review or has sensitive support flags. Open tickets: ${snapshot.tickets.length}. Human support should verify the case before providing account-specific resolution steps.`,
      handoffRequired: true,
      handoffReason: "Account review or identity-sensitive support flag.",
    };
  }

  if (failedTransactions.length >= 2) {
    return {
      summary: `The active account has ${failedTransactions.length} recent failed transactions. Share the visible failure reasons and escalate if the failures continue after standard checks.`,
      handoffRequired: true,
      handoffReason: "Repeated recent transaction failures.",
    };
  }

  return {
    summary: `The account is ${snapshot.profile.account_status} on the ${snapshot.profile.plan} plan. Recent transactions: ${snapshot.transactions.length}. Open tickets: ${snapshot.tickets.length}. No automatic handoff trigger was found.`,
    handoffRequired: false,
    handoffReason: null,
  };
}

async function loadSupportSnapshot(externalCustomerId: string): Promise<SupportSnapshot> {
  const profile = await getCustomerProfileByExternalId(externalCustomerId);

  if (!profile) {
    return {
      profile: null,
      transactions: [],
      tickets: [],
    };
  }

  const [transactions, tickets] = await Promise.all([
    getRecentTransactions(profile.id, 10),
    getOpenTickets(profile.id),
  ]);

  return {
    profile,
    transactions,
    tickets,
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
