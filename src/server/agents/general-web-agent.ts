import { Output, ToolLoopAgent, tool } from "ai";
import { z } from "zod";
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
    tools: {
      webSearch: tool({
        description: "Search the web for current or non-InfinitePay questions.",
        inputSchema: z.object({
          query: z.string().min(1),
        }),
        execute: async (input) => searchWeb(input.query),
      }),
    },
    instructions: `You are the General Web Agent.
Use webSearch before answering current-events questions. If search results are sparse, say that directly and avoid pretending to know fresh facts.`,
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

async function searchWeb(query: string) {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_redirect", "1");
  url.searchParams.set("no_html", "1");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Web search failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
  };

  return {
    abstract: data.AbstractText ?? "",
    abstractUrl: data.AbstractURL ?? "",
    relatedTopics: (data.RelatedTopics ?? [])
      .filter((topic) => topic.Text && topic.FirstURL)
      .slice(0, 5)
      .map((topic) => ({
        text: topic.Text,
        url: topic.FirstURL,
      })),
  };
}
