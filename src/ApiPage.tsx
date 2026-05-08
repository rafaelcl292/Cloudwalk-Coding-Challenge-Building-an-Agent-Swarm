import { useAuth } from "@clerk/react";
import { useState } from "react";
import { PageHeader } from "./PageHeader";

type EndpointId = "swarm" | "health" | "dashboard" | "knowledge-sources" | "conversations";

type Endpoint = {
  id: EndpointId;
  method: "GET" | "POST";
  path: string;
  label: string;
  description: string;
  defaultBody: string | null;
};

const endpoints: Endpoint[] = [
  {
    id: "swarm",
    method: "POST",
    path: "/api/swarm",
    label: "Swarm",
    description:
      "The challenge-compatible JSON endpoint. Routes the message through the swarm and returns the reply with route plan, sources, and handoff.",
    defaultBody: JSON.stringify(
      {
        message: "What are the fees of the Maquininha Smart?",
        user_id: "client789",
      },
      null,
      2,
    ),
  },
  {
    id: "health",
    method: "GET",
    path: "/api/health",
    label: "Health",
    description: "Public liveness check. Useful to confirm the API is up before sending real work.",
    defaultBody: null,
  },
  {
    id: "dashboard",
    method: "GET",
    path: "/api/dashboard",
    label: "Dashboard",
    description: "Aggregate metrics and the most recent agent runs.",
    defaultBody: null,
  },
  {
    id: "knowledge-sources",
    method: "GET",
    path: "/api/knowledge/sources",
    label: "Knowledge sources",
    description:
      "The configured InfinitePay source list, with crawl status and chunk counts when the database has been ingested.",
    defaultBody: null,
  },
  {
    id: "conversations",
    method: "GET",
    path: "/api/conversations",
    label: "Conversations",
    description: "List the authenticated user's conversations.",
    defaultBody: null,
  },
];

type ResponseState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "done";
      status: number;
      ok: boolean;
      latencyMs: number;
      headers: Record<string, string>;
      body: string;
    }
  | { kind: "error"; message: string };

export function ApiPage() {
  const { getToken } = useAuth();
  const [endpointId, setEndpointId] = useState<EndpointId>("swarm");
  const endpoint = endpoints.find((e) => e.id === endpointId)!;
  const [body, setBody] = useState<string>(endpoint.defaultBody ?? "");
  const [response, setResponse] = useState<ResponseState>({ kind: "idle" });

  const switchEndpoint = (id: EndpointId) => {
    const next = endpoints.find((e) => e.id === id)!;
    setEndpointId(id);
    setBody(next.defaultBody ?? "");
    setResponse({ kind: "idle" });
  };

  const send = async () => {
    setResponse({ kind: "loading" });
    try {
      const token = await getToken();
      const headers = new Headers();
      if (token) headers.set("authorization", `Bearer ${token}`);

      let payload: BodyInit | undefined;
      if (endpoint.method === "POST" && body.trim().length > 0) {
        try {
          JSON.parse(body);
        } catch (err) {
          setResponse({
            kind: "error",
            message: `Invalid JSON in request body: ${err instanceof Error ? err.message : String(err)}`,
          });
          return;
        }
        headers.set("content-type", "application/json");
        payload = body;
      }

      const startedAt = performance.now();
      const res = await fetch(endpoint.path, {
        method: endpoint.method,
        headers,
        body: payload,
      });
      const latencyMs = Math.round(performance.now() - startedAt);

      const respHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });

      const text = await res.text();
      let pretty = text;
      if (respHeaders["content-type"]?.includes("application/json")) {
        try {
          pretty = JSON.stringify(JSON.parse(text), null, 2);
        } catch {
          pretty = text;
        }
      }

      setResponse({
        kind: "done",
        status: res.status,
        ok: res.ok,
        latencyMs,
        headers: respHeaders,
        body: pretty,
      });
    } catch (err) {
      setResponse({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-10">
      <PageHeader
        kicker="Section · Workshop"
        title="The Workshop"
        lede="Send signed requests to the swarm API. Bearer tokens are attached automatically from your Clerk session."
      />

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-px bg-rule border border-rule">
        <aside className="bg-ink p-5">
          <div className="kicker">Endpoints</div>
          <ul className="mt-3 space-y-1">
            {endpoints.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => switchEndpoint(e.id)}
                  className={`w-full text-left px-2 py-2 transition-colors ${
                    endpointId === e.id
                      ? "bg-ink-3 text-paper"
                      : "text-paper-dim hover:text-paper hover:bg-ink-2"
                  }`}
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-paper-mute">
                    {e.method}
                  </div>
                  <div className="serif text-[14px]">{e.label}</div>
                  <div className="font-mono text-[10px] text-paper-mute truncate">{e.path}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="bg-ink p-6 lg:p-8">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="font-mono text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 border"
              style={{
                color: "var(--color-ember)",
                borderColor: "rgba(200, 71, 43, 0.4)",
                background: "rgba(200, 71, 43, 0.06)",
              }}
            >
              {endpoint.method}
            </span>
            <code className="font-mono text-[14px] text-paper">{endpoint.path}</code>
          </div>
          <p className="serif text-[15px] mt-3 text-paper-dim leading-relaxed max-w-[60ch]">
            {endpoint.description}
          </p>

          {endpoint.method === "POST" ? (
            <div className="mt-6">
              <label className="kicker block">Request body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                spellCheck={false}
                className="mt-2 w-full bg-ink-2 border border-rule p-3 font-mono text-[12px] text-paper focus:outline-none focus:border-paper-dim resize-y"
              />
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={response.kind === "loading"}
              className="btn-ember px-5 py-2.5 text-xs uppercase tracking-[0.15em] rounded"
            >
              {response.kind === "loading" ? "Sending…" : "Send request"}
            </button>
            <span className="font-mono text-[11px] text-paper-mute">
              Bearer token is attached automatically.
            </span>
          </div>

          <ResponsePanel response={response} />
        </div>
      </div>
    </div>
  );
}

function ResponsePanel({ response }: { response: ResponseState }) {
  if (response.kind === "idle") {
    return (
      <div className="mt-8 border-t border-rule pt-6">
        <div className="kicker">Response</div>
        <p className="serif text-[15px] mt-2 text-paper-dim italic">
          The response will be typeset here.
        </p>
      </div>
    );
  }
  if (response.kind === "loading") {
    return (
      <div className="mt-8 border-t border-rule pt-6 flex items-center gap-2 text-paper-mute">
        <span className="inline-flex gap-1">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.18em]">awaiting</span>
      </div>
    );
  }
  if (response.kind === "error") {
    return (
      <div className="mt-8 border-t border-rule pt-6">
        <div
          className="font-mono text-[11px] uppercase tracking-[0.18em]"
          style={{ color: "var(--color-ember)" }}
        >
          Network error
        </div>
        <p className="serif text-base mt-2">{response.message}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-rule pt-6 anim-fade">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="kicker">Response</div>
        <span
          className="font-mono text-[11px]"
          style={{ color: response.ok ? "var(--color-moss)" : "var(--color-ember)" }}
        >
          HTTP {response.status}
        </span>
        <span className="font-mono text-[11px] text-paper-mute">
          · {response.latencyMs.toLocaleString()} ms
        </span>
        {response.headers["x-request-id"] ? (
          <span className="font-mono text-[11px] text-paper-mute">
            · req {response.headers["x-request-id"].slice(0, 8)}
          </span>
        ) : null}
      </div>
      <pre className="mt-3 font-mono text-[11px] leading-relaxed text-paper-dim bg-ink-2 border border-rule p-4 overflow-x-auto whitespace-pre-wrap break-words">
        {response.body || "(empty body)"}
      </pre>
    </div>
  );
}
