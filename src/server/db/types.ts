export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type UserRole = "user" | "operator" | "admin";
export type ConversationChannel = "web" | "whatsapp" | "telegram";
export type ConversationStatus = "open" | "handoff" | "resolved" | "archived";
export type MessageRole = "system" | "user" | "assistant" | "tool";
export type AgentRunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type CrawlStatus = "pending" | "running" | "succeeded" | "failed";
export type AccountStatus = "active" | "blocked" | "review" | "closed";
export type TransactionStatus = "approved" | "pending" | "failed" | "reversed";
export type TransactionType = "payment" | "payout" | "refund" | "chargeback";
export type TicketStatus = "open" | "pending_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";

export type UserRow = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
};

export type ConversationRow = {
  id: string;
  owner_user_id: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  title: string | null;
  created_at: Date;
  updated_at: Date;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  parts: JsonValue;
  metadata: JsonValue;
  created_at: Date;
};

export type AgentRunRow = {
  id: string;
  conversation_id: string | null;
  router_decision: string | null;
  selected_agents: string[];
  model: string | null;
  status: AgentRunStatus;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ToolCallRow = {
  id: string;
  agent_run_id: string;
  tool_name: string;
  input: JsonValue;
  output: JsonValue;
  error: string | null;
  duration_ms: number | null;
  created_at: Date;
};

export type KnowledgeSourceRow = {
  id: string;
  source_url: string;
  title: string | null;
  crawl_status: CrawlStatus;
  content_hash: string | null;
  last_crawled_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type KnowledgeChunkRow = {
  id: string;
  source_id: string;
  chunk_text: string;
  metadata: JsonValue;
  token_count: number;
  created_at: Date;
};

export type CustomerProfileRow = {
  id: string;
  user_id: string | null;
  external_customer_id: string;
  name: string;
  email: string | null;
  account_status: AccountStatus;
  plan: string;
  limits: JsonValue;
  support_flags: string[];
  created_at: Date;
  updated_at: Date;
};

export type CustomerTransactionRow = {
  id: string;
  customer_id: string;
  transaction_type: TransactionType;
  amount_cents: number;
  currency: string;
  status: TransactionStatus;
  failure_reason: string | null;
  occurred_at: Date;
  created_at: Date;
};

export type SupportTicketRow = {
  id: string;
  customer_id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  summary: string | null;
  created_at: Date;
  updated_at: Date;
};
