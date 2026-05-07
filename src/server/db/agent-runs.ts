import { getDb, type Database } from "./client";
import type { AgentRunRow, AgentRunStatus, JsonValue, ToolCallRow } from "./types";

export type CreateAgentRunInput = {
  conversationId?: string | null;
  routerDecision?: string | null;
  selectedAgents?: string[];
  model?: string | null;
};

export type FinishAgentRunInput = {
  id: string;
  status: Exclude<AgentRunStatus, "running">;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  error?: string | null;
};

export type RecordToolCallInput = {
  agentRunId: string;
  toolName: string;
  input?: JsonValue;
  output?: JsonValue;
  error?: string | null;
  durationMs?: number | null;
};

export async function createAgentRun(input: CreateAgentRunInput, database: Database = getDb()) {
  const rows = await database<AgentRunRow[]>`
    INSERT INTO agent_runs (conversation_id, router_decision, selected_agents, model)
    VALUES (
      ${input.conversationId ?? null},
      ${input.routerDecision ?? null},
      ${input.selectedAgents ?? []}::text[],
      ${input.model ?? null}
    )
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function finishAgentRun(input: FinishAgentRunInput, database: Database = getDb()) {
  const rows = await database<AgentRunRow[]>`
    UPDATE agent_runs
    SET
      status = ${input.status},
      latency_ms = ${input.latencyMs ?? null},
      input_tokens = ${input.inputTokens ?? null},
      output_tokens = ${input.outputTokens ?? null},
      error = ${input.error ?? null}
    WHERE id = ${input.id}
    RETURNING *
  `;

  return rows[0] ?? null;
}

export async function recordToolCall(input: RecordToolCallInput, database: Database = getDb()) {
  const rows = await database<ToolCallRow[]>`
    INSERT INTO tool_calls (agent_run_id, tool_name, input, output, error, duration_ms)
    VALUES (
      ${input.agentRunId},
      ${input.toolName},
      ${JSON.stringify(input.input ?? {})}::jsonb,
      ${JSON.stringify(input.output ?? {})}::jsonb,
      ${input.error ?? null},
      ${input.durationMs ?? null}
    )
    RETURNING *
  `;

  return rows[0] ?? null;
}
