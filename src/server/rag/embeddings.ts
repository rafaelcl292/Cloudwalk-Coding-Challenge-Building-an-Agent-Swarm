import { gateway } from "@ai-sdk/gateway";
import { embed, embedMany } from "ai";

export function getEmbeddingModel() {
  const modelId = process.env.AI_GATEWAY_EMBEDDING_MODEL;

  if (!modelId || !process.env.AI_GATEWAY_API_KEY) {
    return null;
  }

  return gateway.embeddingModel(modelId);
}

export async function embedQuery(value: string) {
  const model = getEmbeddingModel();

  if (!model) {
    return null;
  }

  const result = await embed({
    model,
    value,
  });

  return result.embedding;
}

export async function embedChunks(values: string[]) {
  const model = getEmbeddingModel();

  if (!model || values.length === 0) {
    return values.map(() => null);
  }

  const result = await embedMany({
    model,
    values,
    maxParallelCalls: 2,
  });

  return result.embeddings;
}
