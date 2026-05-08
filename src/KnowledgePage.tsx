import { useAuth } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { PageHeader } from "./PageHeader";
import { useAuthedFetch } from "./useAuthedFetch";

type Source = {
  sourceUrl: string;
  title: string | null;
  crawlStatus: "pending" | "running" | "succeeded" | "failed";
  lastCrawledAt: string | null;
  chunkCount: number;
};

type SourcesResponse = {
  apiVersion: string;
  requestId: string;
  sources: Source[];
  databaseAvailable?: boolean;
};

export function KnowledgePage() {
  const { isLoaded, isSignedIn } = useAuth();
  const authedFetch = useAuthedFetch();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [databaseAvailable, setDatabaseAvailable] = useState(true);
  const requestRef = useRef<Promise<SourcesResponse> | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        requestRef.current ??= (async () => {
          const res = await authedFetch("/api/knowledge/sources");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as SourcesResponse;
        })();

        const json = await requestRef.current;
        if (!cancelled) {
          setSources(json.sources);
          setDatabaseAvailable(json.databaseAvailable !== false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          requestRef.current = null;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, isLoaded, isSignedIn]);

  const totalChunks = sources?.reduce((sum, s) => sum + s.chunkCount, 0) ?? 0;
  const ingested = sources?.filter((s) => s.crawlStatus === "succeeded").length ?? 0;

  return (
    <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-10">
      <PageHeader
        kicker="Section · Sources"
        title="The Library"
        lede="Every InfinitePay page the Knowledge Agent draws from, with crawl status, last fetched date, and chunk count after embedding."
      />

      {!databaseAvailable ? (
        <div className="mt-6 border border-rule bg-ink-2 px-4 py-3">
          <div className="kicker">Note</div>
          <p className="text-[13px] mt-1 text-paper-dim leading-relaxed">
            The database is not reachable, so the table below shows the configured source list only.
            Run <code className="font-mono">bun run rag:ingest</code> after Postgres is up to
            populate chunk counts and crawl dates.
          </p>
        </div>
      ) : null}

      {loading ? <ListSkeleton /> : null}
      {error ? <ErrorPanel message={error} /> : null}

      {sources ? (
        <>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-px bg-rule border border-rule">
            <FigureCell label="Total sources" value={sources.length.toString()} />
            <FigureCell label="Ingested" value={ingested.toString()} />
            <FigureCell label="Chunks" value={totalChunks.toLocaleString()} />
            <FigureCell label="Pending" value={(sources.length - ingested).toString()} />
          </div>

          <section className="mt-10">
            <div className="kicker">Page 02 · The shelf</div>
            <h2 className="display-tight text-2xl mt-2">Source by source</h2>

            <div className="mt-6 border-t border-rule">
              {sources.map((source, i) => (
                <SourceRow key={source.sourceUrl} index={i + 1} source={source} />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function SourceRow({ index, source }: { index: number; source: Source }) {
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto_auto] gap-x-4 items-baseline py-4 border-b border-rule">
      <span className="figure-num text-2xl text-paper-mute">{String(index).padStart(2, "0")}</span>
      <div className="min-w-0">
        <div className="serif text-[15px] truncate">
          {source.title ?? prettyPath(source.sourceUrl)}
        </div>
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono text-[11px] text-gold hover:text-paper underline decoration-dotted underline-offset-2 break-all"
        >
          {source.sourceUrl}
        </a>
      </div>
      <span className="font-mono text-[11px] text-paper-mute tabular-nums whitespace-nowrap">
        {source.lastCrawledAt ? formatDate(source.lastCrawledAt) : "—"}
      </span>
      <div className="flex items-center gap-2 whitespace-nowrap">
        <CrawlPill status={source.crawlStatus} />
        <span className="font-mono text-[11px] tabular-nums text-paper-dim">
          {source.chunkCount > 0 ? `${source.chunkCount} ch.` : "0 ch."}
        </span>
      </div>
    </div>
  );
}

function CrawlPill({ status }: { status: Source["crawlStatus"] }) {
  const color =
    status === "succeeded"
      ? "var(--color-moss)"
      : status === "failed"
        ? "var(--color-ember)"
        : status === "running"
          ? "var(--color-gold)"
          : "var(--color-paper-mute)";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em]">
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span style={{ color }}>{status}</span>
    </span>
  );
}

function FigureCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink p-5">
      <div className="kicker">{label}</div>
      <div className="figure-num text-4xl mt-1.5">{value}</div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-8 anim-fade space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-10 bg-ink-3" />
      ))}
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
    </div>
  );
}

function prettyPath(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return path === "" ? u.host : path.replace(/^\//, "").replaceAll("-", " ");
  } catch {
    return url;
  }
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "2-digit" });
  } catch {
    return "—";
  }
}
