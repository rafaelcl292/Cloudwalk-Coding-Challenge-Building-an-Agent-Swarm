import {
  deleteKnowledgeChunks,
  getKnowledgeSourceByUrl,
  insertKnowledgeChunk,
  upsertKnowledgeSource,
} from "../src/server/db";
import { embedChunks } from "../src/server/rag/embeddings";
import { infinitePaySourceUrls } from "../src/server/rag/sources";
import { checksumContent, chunkText, extractTitle, normalizeHtml } from "../src/server/rag/text";

export type IngestKnowledgeResult = {
  ingested: string[];
  skipped: string[];
  failed: Array<{ url: string; error: string }>;
};

export async function ingestKnowledge(urls = [...infinitePaySourceUrls]) {
  const result: IngestKnowledgeResult = {
    ingested: [],
    skipped: [],
    failed: [],
  };

  for (const url of urls) {
    try {
      const existing = await getKnowledgeSourceByUrl(url);
      await upsertKnowledgeSource({
        sourceUrl: url,
        title: existing?.title ?? null,
        crawlStatus: "running",
        contentHash: existing?.content_hash ?? null,
        lastCrawledAt: existing?.last_crawled_at ?? null,
      });

      const response = await fetch(url, {
        headers: {
          "user-agent": "CloudWalkAgentSwarmChallenge/1.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Fetch failed with status ${response.status}`);
      }

      const html = await response.text();
      const normalized = normalizeHtml(html);
      const contentHash = checksumContent(normalized);

      if (existing?.content_hash === contentHash) {
        await upsertKnowledgeSource({
          sourceUrl: url,
          title: existing.title,
          crawlStatus: "succeeded",
          contentHash,
          lastCrawledAt: new Date(),
        });
        result.skipped.push(url);
        continue;
      }

      const source = await upsertKnowledgeSource({
        sourceUrl: url,
        title: extractTitle(html),
        crawlStatus: "succeeded",
        contentHash,
        lastCrawledAt: new Date(),
      });

      if (!source) {
        throw new Error("Could not upsert knowledge source");
      }

      const chunks = chunkText(normalized);
      const embeddings = await embedChunks(chunks.map((chunk) => chunk.text));

      await deleteKnowledgeChunks(source.id);

      for (const chunk of chunks) {
        await insertKnowledgeChunk({
          sourceId: source.id,
          chunkText: chunk.text,
          embedding: embeddings[chunk.index],
          metadata: {
            sourceUrl: url,
            chunkIndex: chunk.index,
          },
          tokenCount: chunk.tokenCount,
        });
      }

      result.ingested.push(url);
    } catch (error) {
      await upsertKnowledgeSource({
        sourceUrl: url,
        crawlStatus: "failed",
      });
      result.failed.push({
        url,
        error: error instanceof Error ? error.message : "Unknown ingestion error",
      });
    }
  }

  return result;
}

if (import.meta.main) {
  const result = await ingestKnowledge();

  console.log(
    JSON.stringify(
      {
        status: result.failed.length === 0 ? "ok" : "partial",
        ...result,
      },
      null,
      2,
    ),
  );
}
