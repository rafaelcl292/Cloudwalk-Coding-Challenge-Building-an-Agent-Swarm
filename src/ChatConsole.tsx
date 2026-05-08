import { useAuth, useUser } from "@clerk/react";
import { useEffect, useRef, useState } from "react";

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
  challengeUserId: string;
  response: string;
  route: RoutePlan;
  conversationId: string | null;
  agentRunId: string | null;
  sources: string[];
  handoffRequired: boolean;
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
  const { getToken } = useAuth();
  const { user } = useUser();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [challengeUserId, setChallengeUserId] = useState("client789");
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

  const submit = async (raw: string) => {
    const message = raw.trim();
    if (!message || pending) return;

    setTurns((prev) => [...prev, { kind: "user", id: cryptoId(), message, at: new Date() }]);
    setDraft("");
    setPending(true);

    try {
      const token = await getToken();
      const headers = new Headers({ "content-type": "application/json" });
      if (token) headers.set("authorization", `Bearer ${token}`);

      const startedAt = performance.now();
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers,
        body: JSON.stringify({ message, user_id: challengeUserId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${text ? ` — ${truncate(text, 240)}` : ""}`);
      }

      const data = (await res.json()) as SwarmResponse;
      const latencyMs = Math.round(performance.now() - startedAt);

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
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] min-h-[calc(100vh-4rem)]">
      <Sidebar
        user={user}
        challengeUserId={challengeUserId}
        onChallengeUserIdChange={setChallengeUserId}
        onReset={() => setTurns([])}
        hasTurns={turns.length > 0}
      />

      <section className="flex flex-col relative">
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
  challengeUserId,
  onChallengeUserIdChange,
  onReset,
  hasTurns,
}: {
  user: ReturnType<typeof useUser>["user"];
  challengeUserId: string;
  onChallengeUserIdChange: (value: string) => void;
  onReset: () => void;
  hasTurns: boolean;
}) {
  return (
    <aside className="hidden lg:flex flex-col border-r border-rule bg-ink-2/30">
      <div className="px-5 py-5 border-b border-rule">
        <button
          type="button"
          onClick={onReset}
          disabled={!hasTurns}
          className="btn-ghost w-full px-3 py-2 text-xs uppercase tracking-[0.18em] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New chat
        </button>
      </div>

      <div className="px-5 py-5 border-b border-rule">
        <label className="kicker block">Customer ID</label>
        <input
          value={challengeUserId}
          onChange={(e) => onChallengeUserIdChange(e.target.value)}
          className="mt-2 w-full bg-ink-3 border border-rule px-3 py-2 font-mono text-xs text-paper focus:outline-none focus:border-paper-dim"
          spellCheck={false}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-paper-mute">
          Sent as <code className="font-mono">user_id</code> for support routing.
        </p>
      </div>

      <div className="flex-1" />

      <div className="px-5 py-4 border-t border-rule">
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
