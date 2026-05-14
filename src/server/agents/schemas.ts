import { z } from "zod";

export const routeCategorySchema = z.enum([
  "knowledge",
  "support",
  "general_web",
  "handoff",
  "blocked",
]);

export const agentNameSchema = z.enum(["guardrails", "knowledge", "support"]);

export const routeToolNameSchema = z.enum([
  "retrieveKnowledge",
  "webSearch",
  "getCustomerProfile",
  "getRecentTransactions",
  "getOpenTickets",
  "createSupportTicket",
  "summarizeAccountIssue",
  "resetPassword",
  "unblockAccount",
  "retryPayout",
  "approveKycReview",
  "clearSupportFlags",
]);

export const routePlanSchema = z.object({
  category: routeCategorySchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  selectedAgents: z.array(agentNameSchema).min(1),
  requiredTools: z.array(routeToolNameSchema),
  handoffReason: z.string().nullable(),
});

export const agentAnswerSchema = z.object({
  answer: z.string().min(1),
  sources: z.array(z.string()),
  handoffRequired: z.boolean(),
  handoffReason: z.string().nullable(),
});

export const plainTextAnswerInstruction =
  "Write user-facing answers as plain text. Do not use Markdown formatting such as **bold**, headings, tables, or bullet syntax.";

export type RouteCategory = z.infer<typeof routeCategorySchema>;
export type AgentName = z.infer<typeof agentNameSchema>;
export type RouteToolName = z.infer<typeof routeToolNameSchema>;
export type RoutePlan = z.infer<typeof routePlanSchema>;
export type AgentAnswer = z.infer<typeof agentAnswerSchema>;

export type SwarmRequest = {
  message: string;
  challengeUserId: string;
  authenticatedUserId: string;
  requestId: string;
  conversationId?: string | null;
};

export type SwarmResult = {
  response: string;
  route: RoutePlan;
  conversationId: string | null;
  agentRunId: string | null;
  sources: string[];
  handoffRequired: boolean;
};
