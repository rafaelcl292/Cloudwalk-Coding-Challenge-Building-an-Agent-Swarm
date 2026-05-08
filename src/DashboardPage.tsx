import { useAuth } from "@clerk/react";
import { useEffect, useState } from "react";
import { PageHeader } from "./PageHeader";

type Metrics = {
  totalConversations: number;
  totalMessages: number;
  routerDecisions: Record<string, number>;
  averageResponseLatencyMs: number;
  failedToolCalls: number;
  supportHandoffs: number;
};

type RecentRun = {
  id: string;
  conversationId: string | null;
  routerDecision: string | null;
  selectedAgents: string[];
  model: string | null;
  status: "running" | "succeeded" | "failed" | "cancelled";
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
};

type DashboardResponse = {
  apiVersion: string;
  requestId: string;
  metrics: Metrics;
  recentRuns: RecentRun[];
};

type ApiError = {
  error: { code: string; message: string };
};

export function DashboardPage() {
  const { getToken } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const headers = new Headers();
        if (token) headers.set("authorization", `Bearer ${token}`);
        const res = await fetch("/api/dashboard", { headers });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as ApiError | null;
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as DashboardResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return (
    <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-10">
      <PageHeader
        kicker="Section · Operations"
        title="The Daily Bulletin"
        lede="Live counts, routes taken, latencies filed, and the runs that did not make it to press."
      />

      {loading ? <DashboardSkeleton /> : null}
      {error ? <ErrorPanel message={error} /> : null}
      {data ? <DashboardContent data={data} /> : null}
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardResponse }) {
  const { metrics, recentRuns } = data;
  const decisionEntries = Object.entries(metrics.routerDecisions).sort((a, b) => b[1] - a[1]);
  const decisionMax = decisionEntries.reduce((max, [, n]) => Math.max(max, n), 0);

  return (
    <div className="mt-10 space-y-12">
      <section>
        <div className="kicker">Front page · By the numbers</div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-rule border border-rule">
          <FigureCell label="Conversations" value={metrics.totalConversations.toLocaleString()} />
          <FigureCell label="Messages" value={metrics.totalMessages.toLocaleString()} />
          <FigureCell
            label="Avg latency"
            value={`${Math.round(metrics.averageResponseLatencyMs).toLocaleString()}`}
            unit="ms"
          />
          <FigureCell label="Failed tools" value={metrics.failedToolCalls.toLocaleString()} />
          <FigureCell label="Handoffs" value={metrics.supportHandoffs.toLocaleString()} />
          <FigureCell
            label="Recent runs"
            value={recentRuns.length.toLocaleString()}
            unit={recentRuns.length === 1 ? "filed" : "filed"}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-10">
        <div>
          <div className="kicker">Page 02 · Router decisions</div>
          <h2 className="display-tight text-2xl mt-2">By category</h2>
          {decisionEntries.length === 0 ? (
            <p className="serif text-base mt-4 text-paper-dim italic">
              No routes recorded yet. The presses are warm.
            </p>
          ) : (
            <ul className="mt-5 space-y-3">
              {decisionEntries.map(([category, count]) => (
                <li key={category} className="flex items-center gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.15em] w-28 shrink-0 text-paper-dim">
                    {category.replace("_", " ")}
                  </span>
                  <span className="relative flex-1 h-[2px] bg-rule">
                    <span
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: decisionMax > 0 ? `${(count / decisionMax) * 100}%` : "0%",
                        background: categoryColor(category),
                      }}
                    />
                  </span>
                  <span className="figure-num text-2xl tabular-nums w-12 text-right">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="kicker">Page 03 · Recent dispatches</div>
          <h2 className="display-tight text-2xl mt-2">Last 10 runs</h2>
          {recentRuns.length === 0 ? (
            <p className="serif text-base mt-4 text-paper-dim italic">
              The press hasn&rsquo;t run yet. Send a question from the Console to populate this
              column.
            </p>
          ) : (
            <div className="mt-5 border-t border-rule">
              {recentRuns.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FigureCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="bg-ink p-5">
      <div className="kicker">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <div className="figure-num text-4xl">{value}</div>
        {unit ? (
          <span className="font-mono text-[10px] uppercase text-paper-mute">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

function RunRow({ run }: { run: RecentRun }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 items-center py-3 border-b border-rule">
      <span className="font-mono text-[10px] tabular-nums text-paper-mute w-20 shrink-0">
        {formatTime(run.createdAt)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusDot status={run.status} />
          <span
            className="font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ color: categoryColor(run.routerDecision ?? "") }}
          >
            {(run.routerDecision ?? "—").replace("_", " ")}
          </span>
          <span className="text-paper-mute">·</span>
          <span className="font-mono text-[11px] text-paper-dim truncate">
            {run.selectedAgents.length > 0 ? run.selectedAgents.join(" + ") : "—"}
          </span>
        </div>
        {run.error ? (
          <div className="font-mono text-[10px] mt-0.5 text-ember/90 truncate">{run.error}</div>
        ) : null}
      </div>
      <span className="font-mono text-[11px] text-paper-dim tabular-nums">
        {run.latencyMs != null ? `${run.latencyMs.toLocaleString()} ms` : "—"}
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: RecentRun["status"] }) {
  const color =
    status === "succeeded"
      ? "var(--color-moss)"
      : status === "failed"
        ? "var(--color-ember)"
        : status === "cancelled"
          ? "var(--color-paper-mute)"
          : "var(--color-gold)";
  return (
    <span
      aria-label={status}
      className="inline-block w-1.5 h-1.5 rounded-full"
      style={{ background: color }}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-10 space-y-8 anim-fade">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-rule border border-rule">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-ink p-5">
            <div className="h-2 bg-ink-3 w-20" />
            <div className="h-9 bg-ink-3 w-16 mt-3" />
          </div>
        ))}
      </div>
      <div className="h-3 bg-ink-3 w-1/3" />
      <div className="h-3 bg-ink-3 w-1/2" />
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mt-10 border border-ember/40 bg-ember/5 p-6 max-w-2xl">
      <div
        className="font-mono text-[11px] uppercase tracking-[0.18em]"
        style={{ color: "var(--color-ember)" }}
      >
        Press error
      </div>
      <p className="serif text-base mt-2">{message}</p>
      <p className="text-[12px] mt-3 text-paper-mute">
        If this is your first run, ensure Postgres is up and migrations are applied:{" "}
        <code className="font-mono text-paper-dim">docker compose up -d postgres</code> then{" "}
        <code className="font-mono text-paper-dim">bun run db:migrate</code>.
      </p>
    </div>
  );
}

function categoryColor(category: string) {
  switch (category) {
    case "knowledge":
      return "var(--color-gold)";
    case "support":
      return "var(--color-moss)";
    case "general_web":
      return "var(--color-paper-dim)";
    case "handoff":
    case "blocked":
      return "var(--color-ember)";
    default:
      return "var(--color-paper-mute)";
  }
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
