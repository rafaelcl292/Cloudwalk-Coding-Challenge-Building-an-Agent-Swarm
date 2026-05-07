import { Output, ToolLoopAgent } from "ai";
import { agentAnswerSchema, type AgentAnswer } from "./schemas";
import type { AgentModelConfig } from "./model";

export function createKnowledgeAgent(config: AgentModelConfig) {
  return new ToolLoopAgent({
    id: "knowledge-agent",
    model: config.model,
    output: Output.object({
      schema: agentAnswerSchema,
      name: "knowledge_answer",
      description: "A grounded answer from the InfinitePay knowledge agent.",
    }),
    instructions: `You are the Knowledge Agent for InfinitePay product and service questions.
Answer only from retrieved InfinitePay context when it is available. If context is missing, say that ingestion and retrieval are not connected yet and explain what source category should answer it later.
Keep answers concise, practical, and cite source URLs when provided.`,
  });
}

export function createKnowledgeFallbackAnswer(message: string): AgentAnswer {
  return {
    answer: `I routed this to the Knowledge Agent because it looks like an InfinitePay product or service question. RAG ingestion is not connected yet, so I cannot provide a grounded answer for "${message}" until Step 7 indexes the InfinitePay sources.`,
    sources: [],
    handoffRequired: false,
    handoffReason: null,
  };
}
