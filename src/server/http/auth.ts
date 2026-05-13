import { createClerkClient, type ClerkClient } from "@clerk/backend";
import { apiError } from "./responses";
import type { RequestContext } from "./request";

export type AuthenticatedUser = {
  userId: string;
  sessionId: string | null;
  orgId: string | null;
  orgRole: string | null;
  isAdmin: boolean;
};

export type AuthResult =
  | {
      ok: true;
      user: AuthenticatedUser;
    }
  | {
      ok: false;
      response: Response;
    };

let clerkClient: ClerkClient | null = null;
const clerkClockSkewInMs = Number(process.env.CLERK_CLOCK_SKEW_MS ?? 30_000);

export function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  clerkClient ??= createClerkClient({
    secretKey,
    publishableKey: process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });

  return clerkClient;
}

export async function getClerkUserProfile(userId: string) {
  const client = getClerkClient();
  if (!client) return null;

  const user = await client.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  const fallbackEmail = user.emailAddresses[0];
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  return {
    name: fullName || user.username || null,
    email: primaryEmail?.emailAddress ?? fallbackEmail?.emailAddress ?? null,
  };
}

export async function requireAuth(req: Request, context: RequestContext): Promise<AuthResult> {
  const client = getClerkClient();

  if (!client) {
    return {
      ok: false,
      response: apiError(
        context.requestId,
        503,
        "CONFIGURATION_ERROR",
        "Clerk authentication is not configured.",
      ),
    };
  }

  const requestState = await client.authenticateRequest(req, {
    clockSkewInMs: clerkClockSkewInMs,
  });

  if (!requestState.isAuthenticated) {
    console.warn("[auth] Clerk request rejected", {
      requestId: context.requestId,
      reason: requestState.reason,
      message: requestState.message,
      hasAuthorization: req.headers.has("authorization"),
      method: req.method,
      path: new URL(req.url).pathname,
    });

    return {
      ok: false,
      response: apiError(context.requestId, 401, "UNAUTHORIZED", "Authentication required."),
    };
  }

  const auth = requestState.toAuth();

  return {
    ok: true,
    user: {
      userId: auth.userId,
      sessionId: auth.sessionId,
      orgId: auth.orgId ?? null,
      orgRole: auth.orgRole ?? null,
      isAdmin: auth.orgRole === "org:admin" || auth.orgRole === "admin",
    },
  };
}

export async function requireAdmin(req: Request, context: RequestContext): Promise<AuthResult> {
  const auth = await requireAuth(req, context);

  if (!auth.ok || auth.user.isAdmin) {
    return auth;
  }

  return {
    ok: false,
    response: apiError(context.requestId, 403, "FORBIDDEN", "Admin access required."),
  };
}
