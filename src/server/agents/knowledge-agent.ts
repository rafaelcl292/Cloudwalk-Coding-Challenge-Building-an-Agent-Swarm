import { Output, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { retrieveKnowledge } from "../rag/retrieval";
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
    tools: {
      retrieveKnowledge: tool({
        description:
          "Retrieve grounded InfinitePay source snippets for product, pricing, rate, and service questions.",
        inputSchema: z.object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(8).default(5),
        }),
        execute: async (input) => ({
          snippets: await retrieveKnowledge(input.query, input.limit),
        }),
      }),
    },
    instructions: `You are the Knowledge Agent for InfinitePay product and service questions.
Call retrieveKnowledge before answering. Answer only from retrieved InfinitePay context when it is available. If retrieval returns no snippets, say the knowledge base does not have enough grounded context yet.
Keep answers concise, practical, and cite source URLs when provided.`,
  });
}

export async function createKnowledgeFallbackAnswer(message: string): Promise<AgentAnswer> {
  const snippets = await retrieveKnowledge(message, 4).catch(() => []);

  if (snippets.length > 0) {
    const sources = [...new Set(snippets.map((snippet) => snippet.sourceUrl))];

    return {
      answer: `I found ${snippets.length} InfinitePay knowledge snippet(s) relevant to "${message}". AI Gateway is not configured, so I cannot synthesize a full LLM answer yet, but the grounded sources are available for the Knowledge Agent.`,
      sources,
      handoffRequired: false,
      handoffReason: null,
    };
  }

  return {
    answer: `I routed this to the Knowledge Agent because it looks like an InfinitePay product or service question. I could not find grounded InfinitePay snippets for "${message}" yet; run the Step 7 ingestion command to populate the knowledge base.`,
    sources: [],
    handoffRequired: false,
    handoffReason: null,
  };
}
