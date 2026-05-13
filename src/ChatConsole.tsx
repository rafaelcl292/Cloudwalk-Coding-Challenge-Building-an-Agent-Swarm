import { useAuth, useUser } from "@clerk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthedFetch } from "./useAuthedFetch";

type RouteCategory = "knowledge" | "support" | "general_web" | "handoff" | "blocked";

type RouteToolName =
  | "retrieveKnowledge"
  | "webSearch"
  | "getCustomerProfile"
  | "getRecentTransactions"
  | "getOpenTickets"
  | "createSupportTicket"
  | "summarizeAccountIssue";

type AgentName = "guardrails" | "knowledge" | "support";

type RoutePlan = {
  category: RouteCategory;
  confidence: number;
  rationale: string;
  selectedAgents: AgentName[];
  requiredTools: RouteToolName[];
  handoffReason: string | null;
};

type SwarmResponse = {
  apiVersion: string;
  requestId: string;
  userId: string;
  response: string;
  route: RoutePlan;
  conversationId: string | null;
  agentRunId: string | null;
  sources: string[];
  handoffRequired: boolean;
};

type PersistedMessage = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  metadata: unknown;
  createdAt: string;
};

type ConversationSummary = {
  id: string;
  title: string | null;
  status: "open" | "handoff" | "resolved" | "archived";
  createdAt: string;
  updatedAt: string;
};

type ConversationsResponse = {
  conversations: ConversationSummary[];
};

type MessagesResponse = {
  messages: PersistedMessage[];
};

type Turn =
  | { kind: "user"; id: string; message: string; at: Date }
  | { kind: "assistant"; id: string; data: SwarmResponse; latencyMs: number; at: Date }
  | { kind: "error"; id: string; message: string; at: Date };

const promptStarters = [
  "What are the fees of the Maquininha Smart?",
  "How can I use my phone as a card machine?",
  "Why am I not able to make transfers?",
  "Quando foi o último jogo do Palmeiras?",
];

export function ChatConsole() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const authedFetch = useAuthedFetch();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns.length, pending]);

  const refreshConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const res = await authedFetch("/api/conversations");
      if (!res.ok) return [];

      const data = (await res.json()) as ConversationsResponse;
      setConversations(data.conversations);
      return data.conversations;
    } finally {
      setLoadingConversations(false);
    }
  }, [authedFetch]);

  const loadConversation = useCallback(
    async (nextConversationId: string) => {
      const restoredTurns = await loadConversationTurns(authedFetch, nextConversationId);
      setConversationId(nextConversationId);
      setTurns(restoredTurns);
    },
    [authedFetch],
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    setTurns([]);
    setConversationId(null);
    void refreshConversations();
  }, [isLoaded, isSignedIn, refreshConversations]);

  const selectConversation = async (nextConversationId: string) => {
    if (nextConversationId === conversationId || pending) return;
    await loadConversation(nextConversationId);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = async (raw: string) => {
    const message = raw.trim();
    if (!message || pending) return;
    if (!isLoaded || !isSignedIn) return;

    setTurns((prev) => [...prev, { kind: "user", id: cryptoId(), message, at: new Date() }]);
    setDraft("");
    setPending(true);

    try {
      const startedAt = performance.now();
      const res = await authedFetch("/api/swarm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          conversation_id: conversationId,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${text ? ` — ${truncate(text, 240)}` : ""}`);
      }

      const data = (await res.json()) as SwarmResponse;
      const latencyMs = Math.round(performance.now() - startedAt);
      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      setTurns((prev) => [
        ...prev,
        {
          kind: "assistant",
          id: cryptoId(),
          data,
          latencyMs,
          at: new Date(),
        },
      ]);
      void refreshConversations();
    } catch (error) {
      setTurns((prev) => [
        ...prev,
        {
          kind: "error",
          id: cryptoId(),
          message: error instanceof Error ? error.message : "Unknown error",
          at: new Date(),
        },
      ]);
    } finally {
      setPending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] lg:min-h-0">
      <Sidebar
        user={user}
        onReset={() => {
          setTurns([]);
          setConversationId(null);
        }}
        hasTurns={turns.length > 0}
        conversations={conversations}
        activeConversationId={conversationId}
        loadingConversations={loadingConversations}
        pending={pending}
        onSelectConversation={(id) => void selectConversation(id)}
      />

      <section className="flex flex-col min-h-0 relative">
        <div ref={threadRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          <div className="max-w-[44rem] mx-auto">
            {turns.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-5 pb-2">
                {turns.map((turn) => (
                  <TurnView key={turn.id} turn={turn} />
                ))}
                {pending ? <PendingBubble /> : null}
              </div>
            )}
          </div>
        </div>

        <Composer
          inputRef={inputRef}
          draft={draft}
          onDraft={setDraft}
          pending={pending}
          starters={turns.length === 0 ? promptStarters.slice(0, 3) : []}
          onPick={(q) => submit(q)}
          onSubmit={() => submit(draft)}
        />
      </section>
    </div>
  );
}

function Sidebar({
  user,
  onReset,
  hasTurns,
  conversations,
  activeConversationId,
  loadingConversations,
  pending,
  onSelectConversation,
}: {
  user: ReturnType<typeof useUser>["user"];
  onReset: () => void;
  hasTurns: boolean;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  loadingConversations: boolean;
  pending: boolean;
  onSelectConversation: (conversationId: string) => void;
}) {
  return (
    <aside className="hidden lg:flex flex-col min-h-0 h-full border-r border-rule bg-ink-2/30">
      <div className="px-5 py-5 border-b border-rule">
        <button
          type="button"
          onClick={onReset}
          disabled={pending || (!hasTurns && !activeConversationId)}
          className="btn-ghost w-full px-3 py-2 text-xs uppercase tracking-[0.18em] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New chat
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-5 py-5 border-b border-rule">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="kicker">Threads</div>
          <span className="font-mono text-[10px] text-paper-mute tabular-nums">
            {conversations.length}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-3 -mx-1 px-1">
          {loadingConversations ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-ink-3/70" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-paper-mute">
              No persisted threads yet. Send a message to start one.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    disabled={pending}
                    className={`w-full text-left px-2.5 py-2 border transition-colors disabled:cursor-not-allowed ${
                      conversation.id === activeConversationId
                        ? "border-ember/50 bg-ember/10 text-paper"
                        : "border-transparent hover:border-rule hover:bg-ink-3/50 text-paper-dim"
                    }`}
                  >
                    <div className="serif text-[13px] truncate">
                      {conversation.title?.trim() || "Untitled thread"}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-paper-mute tabular-nums">
                      {formatThreadDate(conversation.updatedAt)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 py-4 border-t border-rule">
        <div className="kicker">Signed in</div>
        <div className="text-sm mt-1 truncate text-paper-dim">
          {user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "—"}
        </div>
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="pt-10 sm:pt-16 pb-6 text-center anim-fade">
      <div className="ornament text-3xl">❦</div>
      <h2 className="display-tight text-3xl mt-3">Ask the swarm anything.</h2>
      <p className="serif text-base mt-2 text-paper-dim max-w-md mx-auto">
        Three agents — Router, Knowledge, and Support — will decide who answers and cite their
        sources.
      </p>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.kind === "user") {
    return <UserBubble turn={turn} />;
  }
  if (turn.kind === "error") {
    return <ErrorBubble turn={turn} />;
  }
  return <AssistantBubble turn={turn} />;
}

function UserBubble({ turn }: { turn: Extract<Turn, { kind: "user" }> }) {
  return (
    <div className="flex justify-end anim-rise">
      <div
        className="max-w-[85%] px-4 py-2.5 rounded-md whitespace-pre-wrap text-[15px] leading-relaxed"
        style={{
          background: "rgba(200, 71, 43, 0.12)",
          border: "1px solid rgba(200, 71, 43, 0.3)",
          color: "var(--color-paper)",
        }}
      >
        {turn.message}
      </div>
    </div>
  );
}

function ErrorBubble({ turn }: { turn: Extract<Turn, { kind: "error" }> }) {
  return (
    <div className="flex justify-start anim-rise">
      <div className="max-w-[85%] border border-ember/40 bg-ember/5 px-4 py-3 rounded-md">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1"
          style={{ color: "var(--color-ember)" }}
        >
          Error
        </div>
        <p className="text-[14px] leading-relaxed text-paper">{turn.message}</p>
      </div>
    </div>
  );
}

function AssistantBubble({ turn }: { turn: Extract<Turn, { kind: "assistant" }> }) {
  const { data, latencyMs } = turn;
  const { route, response, sources, handoffRequired } = data;
  const [showDetails, setShowDetails] = useState(false);
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="anim-rise">
      {handoffRequired ? <HandoffNote reason={route.handoffReason} /> : null}

      <div className="text-[15px] leading-[1.65] text-paper whitespace-pre-wrap">{response}</div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-paper-mute">
        <span>{route.selectedAgents.map(agentLabel).join(" + ")}</span>
        {route.category !== "knowledge" ? (
          <>
            <span>·</span>
            <span style={{ color: categoryColor(route.category) }}>
              {categoryLabel(route.category)}
            </span>
          </>
        ) : null}
        {sources.length > 0 ? (
          <>
            <span>·</span>
            <button
              type="button"
              onClick={() => setShowSources((v) => !v)}
              className="hover:text-paper-dim transition-colors underline decoration-dotted underline-offset-2"
            >
              {sources.length} {sources.length === 1 ? "source" : "sources"}
            </button>
          </>
        ) : null}
        <span>·</span>
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="hover:text-paper-dim transition-colors"
        >
          {showDetails ? "hide details" : "details"}
        </button>
      </div>

      {showSources && sources.length > 0 ? (
        <ol className="mt-2 space-y-1 anim-fade">
          {sources.map((src, i) => (
            <li key={`${src}-${i}`} className="text-[12px] leading-relaxed">
              <span className="font-mono text-paper-mute mr-1.5">
                [{String(i + 1).padStart(2, "0")}]
              </span>
              {isUrl(src) ? (
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-gold hover:text-paper underline decoration-dotted underline-offset-2 break-all"
                >
                  {prettyUrl(src)}
                </a>
              ) : (
                <span className="text-paper-dim break-words">{src}</span>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {showDetails ? <DetailsPanel route={route} latencyMs={latencyMs} data={data} /> : null}
    </div>
  );
}

function DetailsPanel({
  route,
  latencyMs,
  data,
}: {
  route: RoutePlan;
  latencyMs: number;
  data: SwarmResponse;
}) {
  return (
    <div className="mt-3 border-l border-rule pl-3 anim-fade space-y-2">
      <DetailRow label="confidence">
        <span className="inline-flex items-center gap-2">
          <span className="relative w-16 h-[3px] bg-rule">
            <span
              className="absolute inset-y-0 left-0"
              style={{
                width: `${Math.max(0, Math.min(1, route.confidence)) * 100}%`,
                background: "var(--color-ember)",
              }}
            />
          </span>
          <span className="tabular-nums">{Math.round(route.confidence * 100)}%</span>
        </span>
      </DetailRow>
      <DetailRow label="rationale">
        <span className="text-paper-dim italic">{route.rationale}</span>
      </DetailRow>
      {route.requiredTools.length > 0 ? (
        <DetailRow label="tools">
          <span className="text-paper-dim">{route.requiredTools.join(", ")}</span>
        </DetailRow>
      ) : null}
      <DetailRow label="latency">
        <span className="tabular-nums">{latencyMs.toLocaleString()} ms</span>
      </DetailRow>
      {data.agentRunId ? (
        <DetailRow label="run">
          <span className="text-paper-mute">{data.agentRunId.slice(0, 8)}</span>
        </DetailRow>
      ) : null}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 font-mono text-[11px]">
      <span className="text-paper-mute uppercase tracking-[0.12em] w-20 shrink-0">{label}</span>
      <span className="text-paper">{children}</span>
    </div>
  );
}

function HandoffNote({ reason }: { reason: string | null }) {
  return (
    <div
      className="mb-2 border-l-2 border-ember bg-ember/5 px-3 py-2 rounded-r"
      role="note"
      aria-label="Human handoff"
    >
      <div
        className="font-mono text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--color-ember)" }}
      >
        Handoff to human
      </div>
      <p className="serif text-[13px] mt-1 leading-snug">
        {reason ?? "A human operator should review this conversation."}
      </p>
    </div>
  );
}

function PendingBubble() {
  return (
    <div className="anim-fade flex items-center gap-2 text-paper-mute">
      <span className="inline-flex gap-1">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.18em]">routing</span>
    </div>
  );
}

async function loadConversationTurns(
  authedFetch: ReturnType<typeof useAuthedFetch>,
  conversationId: string,
) {
  const res = await authedFetch(`/api/conversations/${conversationId}/messages`);
  if (!res.ok) return [];

  const data = (await res.json()) as MessagesResponse;
  return data.messages.flatMap(messageToTurn);
}

function messageToTurn(message: PersistedMessage): Turn[] {
  if (message.role === "user") {
    return [
      {
        kind: "user",
        id: message.id,
        message: message.content,
        at: new Date(message.createdAt),
      },
    ];
  }

  if (message.role !== "assistant") return [];

  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const route = isRoutePlan(metadata.route) ? metadata.route : fallbackRoutePlan;
  const sources = Array.isArray(metadata.sources)
    ? metadata.sources.filter((source): source is string => typeof source === "string")
    : [];
  const latencyMs = typeof metadata.latencyMs === "number" ? metadata.latencyMs : 0;
  const agentRunId = typeof metadata.agentRunId === "string" ? metadata.agentRunId : null;
  const handoffRequired =
    typeof metadata.handoffRequired === "boolean" ? metadata.handoffRequired : false;

  return [
    {
      kind: "assistant",
      id: message.id,
      at: new Date(message.createdAt),
      latencyMs,
      data: {
        apiVersion: "v1",
        requestId: "",
        userId: "",
        response: message.content,
        route,
        conversationId: message.conversationId,
        agentRunId,
        sources,
        handoffRequired,
      },
    },
  ];
}

const fallbackRoutePlan: RoutePlan = {
  category: "knowledge",
  confidence: 0,
  rationale: "Restored from persisted conversation history.",
  selectedAgents: ["knowledge"],
  requiredTools: [],
  handoffReason: null,
};

function isRoutePlan(value: unknown): value is RoutePlan {
  if (!isRecord(value)) return false;
  return (
    isRouteCategory(value.category) &&
    typeof value.confidence === "number" &&
    typeof value.rationale === "string" &&
    Array.isArray(value.selectedAgents) &&
    value.selectedAgents.every(isAgentName) &&
    Array.isArray(value.requiredTools) &&
    value.requiredTools.every(isRouteToolName) &&
    (typeof value.handoffReason === "string" || value.handoffReason === null)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRouteCategory(value: unknown): value is RouteCategory {
  return (
    value === "knowledge" ||
    value === "support" ||
    value === "general_web" ||
    value === "handoff" ||
    value === "blocked"
  );
}

function isAgentName(value: unknown): value is AgentName {
  return value === "guardrails" || value === "knowledge" || value === "support";
}

function isRouteToolName(value: unknown): value is RouteToolName {
  return (
    value === "retrieveKnowledge" ||
    value === "webSearch" ||
    value === "getCustomerProfile" ||
    value === "getRecentTransactions" ||
    value === "getOpenTickets" ||
    value === "createSupportTicket" ||
    value === "summarizeAccountIssue"
  );
}

function Composer({
  inputRef,
  draft,
  onDraft,
  pending,
  starters,
  onPick,
  onSubmit,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraft: (v: string) => void;
  pending: boolean;
  starters: string[];
  onPick: (q: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="border-t border-rule bg-ink/95 backdrop-blur-sm sticky bottom-0">
      <div className="max-w-[44rem] mx-auto px-4 sm:px-8 py-4">
        {starters.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {starters.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onPick(q)}
                disabled={pending}
                className="text-[12px] px-3 py-1.5 rounded-full border border-rule text-paper-dim hover:border-paper-dim hover:text-paper transition-colors disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex items-end gap-2 border border-rule rounded-md bg-ink-2 focus-within:border-paper-dim transition-colors px-3 py-2"
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder="Ask the swarm…"
            rows={1}
            className="flex-1 bg-transparent border-0 outline-none resize-none py-1.5 text-[15px] text-paper placeholder:text-paper-mute leading-relaxed max-h-40"
            style={{ fontFamily: "var(--font-sans)" }}
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="btn-ember px-4 py-2 text-xs uppercase tracking-[0.15em] rounded whitespace-nowrap shrink-0"
          >
            {pending ? "…" : "Send"}
          </button>
        </form>
        <div className="mt-2 text-[10px] font-mono uppercase tracking-[0.15em] text-paper-mute text-center">
          Enter to send · Shift + Enter for new line
        </div>
      </div>
    </div>
  );
}

function categoryLabel(category: RouteCategory) {
  return category.replace("_", " ");
}

function categoryColor(category: RouteCategory) {
  switch (category) {
    case "blocked":
    case "handoff":
      return "var(--color-ember)";
    case "support":
      return "var(--color-moss)";
    case "general_web":
      return "var(--color-gold)";
    default:
      return "var(--color-paper-dim)";
  }
}

function agentLabel(a: AgentName) {
  return a.replace(/^./, (c) => c.toUpperCase());
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function formatThreadDate(iso: string) {
  try {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { day: "2-digit", month: "short" });
  } catch {
    return "—";
  }
}

function isUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function prettyUrl(s: string) {
  try {
    const u = new URL(s);
    return (u.host + u.pathname).replace(/\/$/, "");
  } catch {
    return s;
  }
}

function cryptoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
