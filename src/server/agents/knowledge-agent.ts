import { Output, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
import { retrieveKnowledge } from "../rag/retrieval";
import { searchWeb } from "../rag/web-search";
import { agentAnswerSchema, plainTextAnswerInstruction } from "./schemas";
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
      webSearch: tool({
        description:
          "Search the public web for current events or questions outside the InfinitePay knowledge base.",
        inputSchema: z.object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(8).default(5),
        }),
        execute: async (input) => ({
          results: await searchWeb(input.query, input.limit),
        }),
      }),
    },
    instructions: `You are the Knowledge Agent.
For InfinitePay product, pricing, rate, and service questions, call retrieveKnowledge before answering and answer only from retrieved InfinitePay context.
For current events or questions outside the InfinitePay knowledge base, call webSearch before answering. If web results are sparse, say that directly and avoid inventing fresh facts.
When another agent already answered earlier in the route, use that prior answer as context and add only useful complementary information.
${plainTextAnswerInstruction}
Keep answers concise, practical, and cite source URLs when provided.`,
  });
}
