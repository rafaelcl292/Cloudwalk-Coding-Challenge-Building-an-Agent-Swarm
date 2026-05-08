import { gateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type AgentModelConfig = {
  modelId: string;
  provider: "ai-gateway" | "openai";
  model: LanguageModel;
};

export function getAgentModelConfig(): AgentModelConfig {
  const openAiModelId = process.env.OPENAI_MODEL;

  if (openAiModelId && process.env.OPENAI_API_KEY) {
    return {
      modelId: openAiModelId,
      provider: "openai",
      model: openai(openAiModelId),
    };
  }

  const gatewayModelId = process.env.AI_GATEWAY_MODEL;

  if (gatewayModelId && process.env.AI_GATEWAY_API_KEY) {
    return {
      modelId: gatewayModelId,
      provider: "ai-gateway",
      model: gateway(gatewayModelId),
    };
  }

  if (process.env.OPENAI_API_KEY && !openAiModelId) {
    throw new Error("OpenAI configuration is incomplete. Set OPENAI_MODEL.");
  }

  if (process.env.AI_GATEWAY_API_KEY && !gatewayModelId) {
    throw new Error("AI Gateway configuration is incomplete. Set AI_GATEWAY_MODEL.");
  }

  if (openAiModelId && !process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI configuration is incomplete. Set OPENAI_API_KEY.");
  }

  if (gatewayModelId && !process.env.AI_GATEWAY_API_KEY) {
    throw new Error("AI Gateway configuration is incomplete. Set AI_GATEWAY_API_KEY.");
  }

  throw new Error(
    "LLM configuration is required. Set OPENAI_API_KEY and OPENAI_MODEL, or AI_GATEWAY_API_KEY and AI_GATEWAY_MODEL.",
  );
}

export function getEmbeddingModel() {
  const openAiEmbeddingModelId = process.env.OPENAI_EMBEDDING_MODEL;

  if (openAiEmbeddingModelId && process.env.OPENAI_API_KEY) {
    return openai.embeddingModel(openAiEmbeddingModelId);
  }

  const gatewayEmbeddingModelId = process.env.AI_GATEWAY_EMBEDDING_MODEL;

  if (gatewayEmbeddingModelId && process.env.AI_GATEWAY_API_KEY) {
    return gateway.embeddingModel(gatewayEmbeddingModelId);
  }

  if (process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "Embedding configuration is required. Set OPENAI_EMBEDDING_MODEL or AI_GATEWAY_EMBEDDING_MODEL.",
    );
  }

  return null;
}
