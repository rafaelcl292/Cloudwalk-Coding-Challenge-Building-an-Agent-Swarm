import { gateway } from "@ai-sdk/gateway";

export type AgentModelConfig = {
  modelId: string;
  model: ReturnType<typeof gateway>;
};

export function getAgentModelConfig(): AgentModelConfig | null {
  const modelId = process.env.AI_GATEWAY_MODEL;

  if (!modelId || !process.env.AI_GATEWAY_API_KEY) {
    return null;
  }

  return {
    modelId,
    model: gateway(modelId),
  };
}
