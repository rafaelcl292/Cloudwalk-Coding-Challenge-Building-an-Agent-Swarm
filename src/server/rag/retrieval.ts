import { searchKnowledgeChunks, type KnowledgeSearchResult } from "../db";
import { embedQuery } from "./embeddings";

export type RetrievedKnowledgeSnippet = {
  text: string;
  sourceUrl: string;
  sourceTitle: string | null;
  similarity: number | null;
};

export async function retrieveKnowledge(query: string, limit = 5) {
  const embedding = await embedQuery(query);
  const chunks = await searchKnowledgeChunks(query, embedding, limit);

  return chunks.map(toSnippet);
}

export function formatKnowledgeContext(snippets: RetrievedKnowledgeSnippet[]) {
  return snippets
    .map(
      (snippet, index) =>
        `[${index + 1}] ${snippet.sourceTitle ?? snippet.sourceUrl}\n${snippet.sourceUrl}\n${snippet.text}`,
    )
    .join("\n\n");
}

function toSnippet(chunk: KnowledgeSearchResult): RetrievedKnowledgeSnippet {
  return {
    text: chunk.chunk_text,
    sourceUrl: chunk.source_url,
    sourceTitle: chunk.source_title,
    similarity: chunk.similarity,
  };
}
