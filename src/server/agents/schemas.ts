import { z } from "zod";

export const routeCategorySchema = z.enum([
  "knowledge",
  "support",
  "general_web",
  "handoff",
  "blocked",
]);

export const agentNameSchema = z.enum(["guardrails", "knowledge", "support", "general_web"]);

export const routePlanSchema = z.object({
  category: routeCategorySchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
  selectedAgents: z.array(agentNameSchema).min(1),
  requiredTools: z.array(z.string()).default([]),
  handoffReason: z.string().nullable().default(null),
});

export const agentAnswerSchema = z.object({
  answer: z.string().min(1),
  sources: z.array(z.string()).default([]),
  handoffRequired: z.boolean().default(false),
  handoffReason: z.string().nullable().default(null),
});

export type RouteCategory = z.infer<typeof routeCategorySchema>;
export type AgentName = z.infer<typeof agentNameSchema>;
export type RoutePlan = z.infer<typeof routePlanSchema>;
export type AgentAnswer = z.infer<typeof agentAnswerSchema>;

export type SwarmRequest = {
  message: string;
  challengeUserId: string;
  authenticatedUserId: string;
  requestId: string;
};

export type SwarmResult = {
  response: string;
  route: RoutePlan;
  conversationId: string | null;
  agentRunId: string | null;
  sources: string[];
  handoffRequired: boolean;
};
