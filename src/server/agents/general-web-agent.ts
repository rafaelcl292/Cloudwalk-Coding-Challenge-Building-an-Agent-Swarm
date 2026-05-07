import { Output, ToolLoopAgent } from "ai";
import { agentAnswerSchema, type AgentAnswer } from "./schemas";
import type { AgentModelConfig } from "./model";

export function createGeneralWebAgent(config: AgentModelConfig) {
  return new ToolLoopAgent({
    id: "general-web-agent",
    model: config.model,
    output: Output.object({
      schema: agentAnswerSchema,
      name: "general_web_answer",
      description: "A response for questions outside the InfinitePay knowledge base.",
    }),
    instructions: `You are the General Web Agent.
This project has not connected a live web search tool yet. For current-events questions, explain that web search will be added later and avoid pretending to know fresh facts.`,
  });
}

export function createGeneralWebFallbackAnswer(): AgentAnswer {
  return {
    answer:
      "I routed this to the General Web Agent. Live web search is not connected yet, so I cannot answer current-events questions reliably until the web search tool is added.",
    sources: [],
    handoffRequired: false,
    handoffReason: null,
  };
}
