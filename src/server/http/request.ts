import { z, type ZodType } from "zod";
import { apiError } from "./responses";

export type RequestContext = {
  requestId: string;
};

export type ParsedBody<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      response: Response;
    };

export function createRequestContext(req: Request): RequestContext {
  return {
    requestId: req.headers.get("x-request-id") ?? crypto.randomUUID(),
  };
}

export async function parseJsonBody<T>(
  req: Request,
  context: RequestContext,
  schema: ZodType<T>,
): Promise<ParsedBody<T>> {
  const contentType = req.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      response: apiError(
        context.requestId,
        400,
        "BAD_REQUEST",
        "Expected an application/json request body.",
      ),
    };
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: apiError(context.requestId, 400, "BAD_REQUEST", "Invalid JSON body."),
    };
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        context.requestId,
        400,
        "BAD_REQUEST",
        "Request body failed validation.",
        z.treeifyError(parsed.error),
      ),
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}
