import { z } from "zod";
import { runSwarm } from "../agents/orchestrator";
import {
  getDashboardMetrics,
  getConversationForUser,
  applySupportProblemForUser,
  ensureCustomerProfileForUser,
  listConversationMessages,
  listConversationsForUser,
  listKnowledgeSourcesWithCounts,
  listRecentAgentRuns,
  updateCustomerProfileForUser,
  upsertUser,
} from "../db";
import type { JsonValue, MessageRow } from "../db/types";
import { getClerkUserProfile, requireAdmin, requireAuth } from "../http/auth";
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
  user_id: z.string().trim().min(1).optional(),
  conversation_id: z.string().trim().min(1).nullable().optional(),
});

const supportProfileBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().nullable().optional(),
  accountStatus: z.enum(["active", "blocked", "review", "closed"]).optional(),
  plan: z.string().trim().min(1).max(80).optional(),
  dailyPayoutCents: z.number().int().min(0).max(100_000_000).optional(),
  monthlyVolumeCents: z.number().int().min(0).max(1_000_000_000).optional(),
});

const supportProblemBodySchema = z.object({
  kind: z.enum([
    "blocked_account",
    "password_reset",
    "payout_failed",
    "payment_declined",
    "kyc_review",
  ]),
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
    const user = await upsertUser({ clerkUserId: auth.user.userId });
    const clerkProfile = await getClerkUserProfile(auth.user.userId);
    if (user) {
      await ensureCustomerProfileForUser({
        userId: user.id,
        clerkUserId: auth.user.userId,
        name: clerkProfile?.name,
        email: clerkProfile?.email,
      });
    }

    const result = await runSwarm({
      message: body.data.message,
      challengeUserId: body.data.user_id ?? auth.user.userId,
      authenticatedUserId: auth.user.userId,
      requestId: context.requestId,
      conversationId: body.data.conversation_id ?? null,
    });

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      userId: auth.user.userId,
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

export async function supportProfileRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const user = await upsertUser({ clerkUserId: auth.user.userId });
    const clerkProfile = await getClerkUserProfile(auth.user.userId);
    const profile = user
      ? await ensureCustomerProfileForUser({
          userId: user.id,
          clerkUserId: auth.user.userId,
          name: clerkProfile?.name,
          email: clerkProfile?.email,
        })
      : null;

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      profile: profile ? serializeCustomerProfile(profile) : null,
    });
  } catch (error) {
    return apiError(
      context.requestId,
      503,
      "CONFIGURATION_ERROR",
      "Support profile is unavailable. Verify the database connection.",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }
}

export async function updateSupportProfileRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await parseJsonBody(req, context, supportProfileBodySchema);

  if (!body.ok) {
    return body.response;
  }

  try {
    const user = await upsertUser({ clerkUserId: auth.user.userId });
    if (!user) {
      return apiError(context.requestId, 503, "CONFIGURATION_ERROR", "User store unavailable.");
    }

    const clerkProfile = await getClerkUserProfile(auth.user.userId);
    await ensureCustomerProfileForUser({
      userId: user.id,
      clerkUserId: auth.user.userId,
      name: clerkProfile?.name,
      email: clerkProfile?.email,
    });
    const profile = await updateCustomerProfileForUser(user.id, body.data);

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      profile: profile ? serializeCustomerProfile(profile) : null,
    });
  } catch (error) {
    return apiError(
      context.requestId,
      503,
      "CONFIGURATION_ERROR",
      "Support profile could not be updated.",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }
}

export async function createSupportProblemRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await parseJsonBody(req, context, supportProblemBodySchema);

  if (!body.ok) {
    return body.response;
  }

  try {
    const user = await upsertUser({ clerkUserId: auth.user.userId });
    if (!user) {
      return apiError(context.requestId, 503, "CONFIGURATION_ERROR", "User store unavailable.");
    }

    const clerkProfile = await getClerkUserProfile(auth.user.userId);
    await ensureCustomerProfileForUser({
      userId: user.id,
      clerkUserId: auth.user.userId,
      name: clerkProfile?.name,
      email: clerkProfile?.email,
    });
    const result = await applySupportProblemForUser(user.id, body.data.kind);

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      profile: result?.profile ? serializeCustomerProfile(result.profile) : null,
      ticket: result?.ticket ? serializeSupportTicket(result.ticket) : null,
    });
  } catch (error) {
    return apiError(
      context.requestId,
      503,
      "CONFIGURATION_ERROR",
      "Support problem could not be created.",
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

  try {
    const user = await upsertUser({ clerkUserId: auth.user.userId });
    const conversations = user ? await listConversationsForUser(user.id) : [];

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      userId: auth.user.userId,
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        channel: conversation.channel,
        status: conversation.status,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      })),
    });
  } catch (error) {
    return apiError(
      context.requestId,
      503,
      "CONFIGURATION_ERROR",
      "Conversations are unavailable. Verify the database connection.",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }
}

export async function conversationMessagesRoute(req: Request) {
  const context = createRequestContext(req);
  const auth = await requireAuth(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  const conversationId = new URL(req.url).pathname.split("/").at(-2);

  if (!conversationId) {
    return notFound(context.requestId);
  }

  try {
    const user = await upsertUser({ clerkUserId: auth.user.userId });
    const conversation = user ? await getConversationForUser(conversationId, user.id) : null;

    if (!conversation) {
      return notFound(context.requestId);
    }

    const messages = await listConversationMessages(conversation.id);

    return jsonResponse({
      apiVersion,
      requestId: context.requestId,
      conversationId: conversation.id,
      messages: messages.map(serializeMessage),
    });
  } catch (error) {
    return apiError(
      context.requestId,
      503,
      "CONFIGURATION_ERROR",
      "Conversation messages are unavailable. Verify the database connection.",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }
}

function serializeMessage(message: MessageRow) {
  return {
    id: message.id,
    conversationId: message.conversation_id,
    role: message.role,
    content: message.content,
    metadata: message.metadata as JsonValue,
    createdAt: message.created_at,
  };
}

function serializeCustomerProfile(profile: {
  name: string;
  email: string | null;
  account_status: string;
  plan: string;
  limits: JsonValue;
  support_flags: string[];
  updated_at: Date;
}) {
  return {
    name: profile.name,
    email: profile.email,
    accountStatus: profile.account_status,
    plan: profile.plan,
    limits: profile.limits,
    supportFlags: profile.support_flags,
    updatedAt: profile.updated_at,
  };
}

function serializeSupportTicket(ticket: {
  subject: string;
  status: string;
  priority: string;
  summary: string | null;
  created_at: Date;
}) {
  return {
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    summary: ticket.summary,
    createdAt: ticket.created_at,
  };
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
