import { getDb, type Database } from "./client";

export type DashboardMetrics = {
  totalConversations: number;
  totalMessages: number;
  routerDecisions: Record<string, number>;
  averageResponseLatencyMs: number;
  failedToolCalls: number;
  supportHandoffs: number;
};

type CountRow = {
  count: string | number;
};

type AverageRow = {
  average_response_latency_ms: string | number | null;
};

type RouterDecisionRow = {
  router_decision: string;
  count: string | number;
};

export async function getDashboardMetrics(database: Database = getDb()): Promise<DashboardMetrics> {
  const [conversationRows, messageRows, latencyRows, failedToolRows, handoffRows, routerRows] =
    await Promise.all([
      database<CountRow[]>`SELECT count(*) AS count FROM conversations`,
      database<CountRow[]>`SELECT count(*) AS count FROM messages`,
      database<AverageRow[]>`
        SELECT COALESCE(avg(latency_ms), 0) AS average_response_latency_ms
        FROM agent_runs
        WHERE latency_ms IS NOT NULL
      `,
      database<CountRow[]>`SELECT count(*) AS count FROM tool_calls WHERE error IS NOT NULL`,
      database<CountRow[]>`SELECT count(*) AS count FROM conversations WHERE status = 'handoff'`,
      database<RouterDecisionRow[]>`
        SELECT router_decision, count(*) AS count
        FROM agent_runs
        WHERE router_decision IS NOT NULL
        GROUP BY router_decision
        ORDER BY router_decision ASC
      `,
    ]);

  return {
    totalConversations: toNumber(conversationRows[0]?.count),
    totalMessages: toNumber(messageRows[0]?.count),
    routerDecisions: Object.fromEntries(
      routerRows.map((row) => [row.router_decision, toNumber(row.count)]),
    ),
    averageResponseLatencyMs: toNumber(latencyRows[0]?.average_response_latency_ms),
    failedToolCalls: toNumber(failedToolRows[0]?.count),
    supportHandoffs: toNumber(handoffRows[0]?.count),
  };
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}
