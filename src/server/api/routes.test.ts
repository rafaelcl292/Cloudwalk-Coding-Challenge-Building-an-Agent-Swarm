import { describe, expect, test } from "bun:test";
import { apiRoute, healthRoute, swarmRoute } from "./routes";

describe("api routes", () => {
  test("health route returns public status", async () => {
    const response = await healthRoute(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.apiVersion).toBe("v1");
    expect(body.requestId).toBeString();
  });

  test("apiRoute rejects unsupported methods", async () => {
    const route = apiRoute({ GET: healthRoute });
    const response = await route(new Request("http://localhost/api/health", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  test("protected swarm route fails closed without Clerk configuration", async () => {
    const previousSecret = process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_SECRET_KEY;

    const response = await swarmRoute(
      new Request("http://localhost/api/swarm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Hello", user_id: "client789" }),
      }),
    );
    const body = await response.json();

    if (previousSecret === undefined) {
      delete process.env.CLERK_SECRET_KEY;
    } else {
      process.env.CLERK_SECRET_KEY = previousSecret;
    }

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("CONFIGURATION_ERROR");
  });
});
