CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'operator', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'telegram')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'handoff', 'resolved', 'archived')),
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  router_decision TEXT,
  selected_agents TEXT[] NOT NULL DEFAULT '{}',
  model TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL UNIQUE,
  title TEXT,
  crawl_status TEXT NOT NULL DEFAULT 'pending' CHECK (crawl_status IN ('pending', 'running', 'succeeded', 'failed')),
  content_hash TEXT,
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  external_customer_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  account_status TEXT NOT NULL CHECK (account_status IN ('active', 'blocked', 'review', 'closed')),
  plan TEXT NOT NULL,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  support_flags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('payment', 'payout', 'refund', 'chargeback')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL CHECK (status IN ('approved', 'pending', 'failed', 'reversed')),
  failure_reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending_customer', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS external_channel_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp', 'telegram')),
  provider_user_id TEXT NOT NULL,
  provider_chat_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (
    verification_status IN ('unverified', 'verified', 'revoked')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS conversations_owner_created_idx ON conversations (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_runs_conversation_created_idx ON agent_runs (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tool_calls_run_created_idx ON tool_calls (agent_run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS knowledge_chunks_source_idx ON knowledge_chunks (source_id);
CREATE INDEX IF NOT EXISTS customer_transactions_customer_occurred_idx ON customer_transactions (
  customer_id,
  occurred_at DESC
);
CREATE INDEX IF NOT EXISTS support_tickets_customer_status_idx ON support_tickets (customer_id, status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER agent_runs_set_updated_at
BEFORE UPDATE ON agent_runs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER knowledge_sources_set_updated_at
BEFORE UPDATE ON knowledge_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customer_profiles_set_updated_at
BEFORE UPDATE ON customer_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER support_tickets_set_updated_at
BEFORE UPDATE ON support_tickets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER external_channel_accounts_set_updated_at
BEFORE UPDATE ON external_channel_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
