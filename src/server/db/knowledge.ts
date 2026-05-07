import { getDb, type Database } from "./client";
import type { CrawlStatus, JsonValue, KnowledgeChunkRow, KnowledgeSourceRow } from "./types";

export type UpsertKnowledgeSourceInput = {
  sourceUrl: string;
  title?: string | null;
  crawlStatus?: CrawlStatus;
  contentHash?: string | null;
  lastCrawledAt?: Date | null;
};

export type InsertKnowledgeChunkInput = {
  sourceId: string;
  chunkText: string;
  embedding?: number[] | null;
  metadata?: JsonValue;
  tokenCount?: number;
};

export async function upsertKnowledgeSource(
  input: UpsertKnowledgeSourceInput,
  database: Database = getDb(),
) {
  const rows = await database<KnowledgeSourceRow[]>`
    INSERT INTO knowledge_sources (source_url, title, crawl_status, content_hash, last_crawled_at)
    VALUES (
      ${input.sourceUrl},
      ${input.title ?? null},
      ${input.crawlStatus ?? "pending"},
      ${input.contentHash ?? null},
      ${input.lastCrawledAt ?? null}
    )
    ON CONFLICT (source_url) DO UPDATE SET
      title = EXCLUDED.title,
      crawl_status = EXCLUDED.crawl_status,
      content_hash = EXCLUDED.content_hash,
      last_crawled_at = EXCLUDED.last_crawled_at
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function insertKnowledgeChunk(
  input: InsertKnowledgeChunkInput,
  database: Database = getDb(),
) {
  const embedding = input.embedding ? `[${input.embedding.join(",")}]` : null;
  const rows = await database<KnowledgeChunkRow[]>`
    INSERT INTO knowledge_chunks (source_id, chunk_text, embedding, metadata, token_count)
    VALUES (
      ${input.sourceId},
      ${input.chunkText},
      ${embedding}::vector,
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      ${input.tokenCount ?? 0}
    )
    RETURNING id, source_id, chunk_text, metadata, token_count, created_at
  `;

  return rows[0] ?? null;
}

export async function listKnowledgeSources(database: Database = getDb()) {
  return database<KnowledgeSourceRow[]>`
    SELECT *
    FROM knowledge_sources
    ORDER BY source_url ASC
  `;
}
