export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_SERVER_ERROR";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function apiError(
  requestId: string,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  };

  return jsonResponse(body, { status });
}

export function notFound(requestId: string) {
  return apiError(requestId, 404, "NOT_FOUND", "API route not found.");
}

export function methodNotAllowed(requestId: string, allow: string[]) {
  return apiError(requestId, 405, "METHOD_NOT_ALLOWED", "Method not allowed.", {
    allow,
  });
}
