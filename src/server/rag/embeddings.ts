import { embed, embedMany } from "ai";
import { getEmbeddingModel } from "../agents/model";

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
