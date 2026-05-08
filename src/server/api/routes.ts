import { z } from "zod";
import { runSwarm } from "../agents/orchestrator";
import { getDashboardMetrics, listKnowledgeSourcesWithCounts, listRecentAgentRuns } from "../db";
import { requireAdmin, requireAuth } from "../http/auth";
import { createRequestContext, parseJsonBody } from "../http/request";
import { apiError, jsonResponse, methodNotAllowed, notFound } from "../http/responses";
import { infinitePaySourceUrls } from "../rag/sources";

const apiVersion = "v1";

const chatBodySchema = z
  .object({
    message: z.string().trim().min(1).optional(),
    messages: z.array(z.unknown()).optional(),
  })
  .refine((body) => body.message || body.messages?.length, {
    message: "Provide either message or messages.",
  });

const swarmBodySchema = z.object({
  message: z.string().trim().min(1),
  user_id: z.string().trim().min(1),
});

type Handler = (req: Request) => Response | Promise<Response>;
type MethodHandlers = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

export function apiRoute(handlers: MethodHandlers): Handler {
  return async (req) => {
    const context = createRequestContext(req);
    const method = req.method as keyof MethodHandlers;
    const handler = handlers[method];

    if (!handler) {
      return methodNotAllowed(context.requestId, Object.keys(handlers));
    }

    return handler(req);
  };
}

export async function healthRoute(req: Request) {
  const context = createRequestContext(req);

  return jsonResponse({
    status: "ok",
    apiVersion,
    requestId: context.requestId,
    timestamp: new Date().toISOString(),
  });
}

export async function chatRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await parseJsonBody(req, context, chatBodySchema);

  if (!body.ok) {
    return body.response;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const payload = {
        type: "status",
        requestId: context.requestId,
        message:
          "Chat API foundation is ready. Swarm orchestration and AI SDK streaming will be connected in a later step.",
      };

      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "x-request-id": context.requestId,
    },
  });
}

export async function swarmRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await parseJsonBody(req, context, swarmBodySchema);

  if (!body.ok) {
    return body.response;
  }

  try {
    const result = await runSwarm({
      message: body.data.message,
      challengeUserId: body.data.user_id,
      authenticatedUserId: auth.user.userId,
      requestId: context.requestId,
    });

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      userId: auth.user.userId,
      challengeUserId: body.data.user_id,
      response: result.response,
      route: result.route,
      conversationId: result.conversationId,
      agentRunId: result.agentRunId,
      sources: result.sources,
      handoffRequired: result.handoffRequired,
    });
  } catch (error) {
    return apiError(
      context.requestId,
      500,
      "INTERNAL_SERVER_ERROR",
      "Swarm orchestration failed.",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }
}

export async function conversationsRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  return jsonResponse({
    apiVersion,
    requestId: context.requestId,
    userId: auth.user.userId,
    conversations: [],
  });
}

export async function conversationMessagesRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(req.url);
  const conversationId = url.pathname.split("/").at(-2);

  return jsonResponse({
    apiVersion,
    requestId: context.requestId,
    conversationId,
    messages: [],
  });
}

export async function dashboardRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const [metrics, recentRuns] = await Promise.all([
      getDashboardMetrics(),
      listRecentAgentRuns(10),
    ]);

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      metrics,
      recentRuns: recentRuns.map((run) => ({
        id: run.id,
        conversationId: run.conversation_id,
        routerDecision: run.router_decision,
        selectedAgents: run.selected_agents,
        model: run.model,
        status: run.status,
        latencyMs: run.latency_ms,
        error: run.error,
        createdAt: run.created_at,
      })),
    });
  } catch (error) {
    return apiError(
      context.requestId,
      503,
      "CONFIGURATION_ERROR",
      "Dashboard metrics are unavailable. Verify the database connection.",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }
}

export async function knowledgeSourcesRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const rows = await listKnowledgeSourcesWithCounts();
    const seen = new Set(rows.map((row) => row.source_url));

    const persisted = rows.map((row) => ({
      sourceUrl: row.source_url,
      title: row.title,
      crawlStatus: row.crawl_status,
      lastCrawledAt: row.last_crawled_at,
      chunkCount: row.chunk_count,
    }));

    const pending = infinitePaySourceUrls
      .filter((url) => !seen.has(url))
      .map((url) => ({
        sourceUrl: url,
        title: null,
        crawlStatus: "pending" as const,
        lastCrawledAt: null,
        chunkCount: 0,
      }));

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      sources: [...persisted, ...pending],
    });
  } catch {
    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      sources: infinitePaySourceUrls.map((url) => ({
        sourceUrl: url,
        title: null,
        crawlStatus: "pending" as const,
        lastCrawledAt: null,
        chunkCount: 0,
      })),
      databaseAvailable: false,
    });
  }
}

export async function ingestRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAdmin(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  return jsonResponse(
    {
      apiVersion,
      requestId: context.requestId,
      status: "queued",
      message: "Knowledge ingestion endpoint is ready for the RAG pipeline step.",
    },
    { status: 202 },
  );
}

export function unknownApiRoute(req: Request) {
  const context = createRequestContext(req);

  return notFound(context.requestId);
}
