import { z } from "zod";
import { requireAdmin, requireAuth } from "../http/auth";
import { createRequestContext, parseJsonBody } from "../http/request";
import { jsonResponse, methodNotAllowed, notFound } from "../http/responses";

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

  return jsonResponse({
    apiVersion,
    requestId: context.requestId,
    userId: auth.user.userId,
    challengeUserId: body.data.user_id,
    response:
      "Swarm API foundation is ready. Router and specialized agents will generate this response in a later step.",
    route: {
      status: "pending",
      selectedAgents: [],
    },
  });
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
  const auth = await requireAdmin(req, context);

  if (!auth.ok) {
    return auth.response;
  }

  return jsonResponse({
    apiVersion,
    requestId: context.requestId,
    metrics: {
      totalConversations: 0,
      totalMessages: 0,
      routerDecisions: {},
      averageResponseLatencyMs: 0,
      failedToolCalls: 0,
      supportHandoffs: 0,
    },
    recentRuns: [],
  });
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
