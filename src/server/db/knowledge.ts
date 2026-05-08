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

export type KnowledgeSearchResult = KnowledgeChunkRow & {
  source_url: string;
  source_title: string | null;
  similarity: number | null;
};

export async function getKnowledgeSourceByUrl(sourceUrl: string, database: Database = getDb()) {
  const rows = await database<KnowledgeSourceRow[]>`
    SELECT *
    FROM knowledge_sources
    WHERE source_url = ${sourceUrl}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

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

export async function deleteKnowledgeChunks(sourceId: string, database: Database = getDb()) {
  await database`
    DELETE FROM knowledge_chunks
    WHERE source_id = ${sourceId}
  `;
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

export async function searchKnowledgeChunks(
  query: string,
  embedding: number[] | null,
  limit = 5,
  database: Database = getDb(),
): Promise<KnowledgeSearchResult[]> {
  if (embedding) {
    const vector = `[${embedding.join(",")}]`;

    const vectorRows = await database<KnowledgeSearchResult[]>`
      SELECT
        kc.id,
        kc.source_id,
        kc.chunk_text,
        kc.metadata,
        kc.token_count,
        kc.created_at,
        ks.source_url,
        ks.title AS source_title,
        1 - (kc.embedding <=> ${vector}::vector) AS similarity
      FROM knowledge_chunks kc
      JOIN knowledge_sources ks ON ks.id = kc.source_id
      WHERE kc.embedding IS NOT NULL
      ORDER BY kc.embedding <=> ${vector}::vector
      LIMIT ${limit}
    `;

    if (vectorRows.length > 0) {
      return vectorRows;
    }
  }

  return searchKnowledgeChunksLexically(query, limit, database);
}

async function searchKnowledgeChunksLexically(query: string, limit: number, database: Database) {
  const rows = await database<KnowledgeSearchResult[]>`
    SELECT
      kc.id,
      kc.source_id,
      kc.chunk_text,
      kc.metadata,
      kc.token_count,
      kc.created_at,
      ks.source_url,
      ks.title AS source_title,
      NULL::double precision AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_sources ks ON ks.id = kc.source_id
    ORDER BY kc.created_at DESC
    LIMIT 200
  `;

  return rows
    .map((row) => ({
      row,
      score: scoreKnowledgeChunk(query, row.chunk_text),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      ...item.row,
      similarity: item.score,
    }));
}

export function scoreKnowledgeChunk(query: string, chunkText: string) {
  const terms = tokenizeSearchText(query);
  const normalizedChunk = normalizeSearchText(chunkText);

  if (terms.length === 0) {
    return 0;
  }

  const matches = terms.filter((term) => normalizedChunk.includes(term)).length;

  return matches / terms.length;
}

function tokenizeSearchText(value: string) {
  return [
    ...new Set(
      normalizeSearchText(value)
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 2),
    ),
  ];
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
