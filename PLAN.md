# Agent Swarm Implementation Plan

## Goal

Build a Bun + React application that satisfies `CHALLENGE.md` by exposing an authenticated API, a multi-agent AI SDK swarm, a RAG knowledge base over InfinitePay pages, a customer-facing chat interface, and an operator dashboard. The final stretch should add WhatsApp and Telegram channels that reuse the same internal swarm API.

## Architecture Direction

Use Bun as the runtime, `Bun.serve()` for the HTTP API and frontend serving, React for the dashboard/chat UI, Clerk for login and endpoint authentication, and the AI SDK for agent orchestration, tool calling, streaming responses, and typed chat UI integration.

The swarm should communicate through direct internal function calls first. This keeps the coding challenge implementation easy to reason about while still allowing every run, route decision, tool call, and message to be persisted as database events. If the system later needs background jobs or external channels at scale, this can evolve into a queue-backed workflow without changing the public API shape.

## Skill Usage Instructions

Use the project-local skills before implementing AI SDK or Clerk code. These skills are available under `.agents/skills` in this repository.

- For AI SDK work, use `.agents/skills/ai-sdk/SKILL.md` before writing agent, tool, streaming, RAG, embedding, or `useChat` code. Verify current APIs from local AI SDK docs/source or official docs instead of relying on memory. Prefer `ToolLoopAgent`, typed tools with `inputSchema`, structured output, `InferAgentUIMessage`, and current `useChat` patterns.
- For Clerk setup, use `.agents/skills/clerk/SKILL.md` as the router skill, then follow `.agents/skills/clerk-setup/SKILL.md` for installation and environment setup.
- For React authentication UI, use `.agents/skills/clerk-react-patterns/SKILL.md`. This project is a React SPA on Bun, so plan for `@clerk/react`, `ClerkProvider`, `useAuth`, `useUser`, and `getToken()` for authenticated API calls.
- For Clerk Backend API work, use `.agents/skills/clerk-backend-api/SKILL.md`. Only use it for Clerk REST API operations such as listing users, managing metadata, organizations, or other Clerk-side resources. Confirm required secrets and scopes before any Clerk write operation.
- When implementation begins, document which skill guidance influenced major AI SDK and Clerk decisions in the README's architecture or implementation notes.

## Database Decision

Use Postgres with Bun's built-in SQL client:

```ts
import { sql, SQL } from "bun";
```

Postgres is the database choice for this project because the challenge needs persisted conversations, customer support data, RAG source documents, embeddings, agent run traces, and future WhatsApp/Telegram message state. It also gives a clean path to `pgvector` for similarity search, which is much better suited to RAG than hand-rolled vector storage.

Run Postgres through `docker-compose.yml` for local development and production-like testing. Keep the data access layer small and explicit.

## Data Model

Create a small schema around the product requirements:

- `users`: Clerk user mapping, role, created/updated timestamps.
- `conversations`: owner user id, channel (`web`, `whatsapp`, `telegram`), status, title, timestamps.
- `messages`: conversation id, role, content, AI SDK message parts JSON, metadata, timestamps.
- `agent_runs`: conversation id, router decision, selected agents, model, status, latency, token usage.
- `tool_calls`: agent run id, tool name, input JSON, output JSON, error, duration.
- `knowledge_sources`: source URL, title, crawl status, content hash, last crawled timestamp.
- `knowledge_chunks`: source id, chunk text, embedding, metadata, token count.
- `customer_profiles`: user/customer id, account status, plan, limits, support flags.
- `customer_transactions`: customer id, transaction type, amount, status, failure reason, timestamp.
- `support_tickets`: customer id, subject, status, priority, summary, timestamps.
- `external_channel_accounts`: user id, provider, provider user/chat id, verification status.

## Multi-Step Plan

### 1. Project Setup

- Rename the template metadata in `package.json` and update `README.md` from Bun starter docs to project-specific docs.
- Add AI SDK dependencies: `ai`, the selected model provider package, `@ai-sdk/react`, and `zod`.
- Add Clerk dependencies for backend auth verification and React login/session UI.
- Add environment variables for model provider credentials, Clerk keys, database URL, and app URL.
- Keep Bun-first scripts: `bun run dev`, `bun run build`, `bun test`, `bun run lint`, and `bun run fmt`.

### 2. API Foundation

- Replace demo routes in `src/index.ts` with versioned API routes.
- Add request helpers for JSON parsing, error responses, auth verification, and request ids.
- Implement authenticated endpoints:
  - `POST /api/chat`: web chat entrypoint with streaming AI SDK responses.
  - `POST /api/swarm`: challenge-compatible JSON endpoint accepting `{ "message": "...", "user_id": "..." }`.
  - `GET /api/conversations`: list authenticated user's conversations.
  - `GET /api/conversations/:id/messages`: load conversation history.
  - `GET /api/dashboard`: aggregate run, message, routing, and support metrics.
  - `POST /api/admin/ingest`: admin-only knowledge ingestion trigger.
- Treat Clerk as the source of truth for the authenticated user. Do not trust `user_id` from the request body for protected endpoints; keep it only for challenge compatibility and map it to the authenticated Clerk user in real usage.

### 3. Clerk Authentication

- Wrap the React app in Clerk's provider.
- Add sign-in/sign-up screens or Clerk components.
- Protect dashboard and chat routes in the frontend.
- Add backend middleware-style helpers that verify Clerk session tokens on every `/api/*` route except explicit health checks.
- Add role checks for admin-only actions such as RAG ingestion and dashboard-wide metrics.

### 4. Database Layer

- Add a `src/server/db` module using Bun SQL.
- Create migration scripts that run with Bun and apply SQL files in order.
- Add seed data for customer profiles, transactions, and support tickets so the Customer Support Agent has realistic tools.
- Add repository modules for conversations, messages, agent runs, tool calls, knowledge chunks, and dashboard metrics.
- Run Postgres through Docker Compose with a persistent volume and optional `pgvector` extension.

### 5. AI SDK Swarm Core

- Create `src/server/agents` with clear agent boundaries:
  - `router-agent.ts`
  - `knowledge-agent.ts`
  - `support-agent.ts`
  - `guardrails-agent.ts`
  - `orchestrator.ts`
- Use AI SDK structured output for the Router Agent so it returns a typed route plan instead of free-form JSON.
- Use AI SDK tools with `inputSchema` and typed outputs for all tool-calling agents.
- Persist every route decision, tool call, error, and final response in `agent_runs` and `tool_calls`.
- Stream final responses from the orchestrator to the frontend using AI SDK UI message streams.

### 6. Router Agent

- Make the Router Agent the only first step for user messages.
- Classify the message into one or more routes:
  - `knowledge`: InfinitePay/product/service questions.
  - `support`: account-specific support questions.
  - `general_web`: current events or questions outside the InfinitePay knowledge base.
  - `handoff`: requests that need human help.
  - `blocked`: unsafe, abusive, or unsupported requests.
- Return a route plan with confidence, rationale, selected agents, and required tools.
- Support sequential routing, such as guardrails first, then support, then knowledge if a support answer needs product policy context.

### 7. Knowledge Agent And RAG

- Build an ingestion script for the InfinitePay URLs listed in `CHALLENGE.md`.
- Fetch each page, extract readable content, normalize it, chunk it, create embeddings, and store chunks in Postgres.
- Add a retrieval tool that embeds the user's query, searches similar chunks, and returns source snippets with URLs.
- Add a web search tool for general-purpose questions from the challenge examples.
- Require the Knowledge Agent to cite the retrieved InfinitePay sources in its internal reasoning metadata and ground its final answer in retrieved content.
- Add freshness tracking with `content_hash` and `last_crawled_at` so ingestion can be rerun safely.

### 8. Customer Support Agent

- Implement at least two tools required by the challenge:
  - `getCustomerProfile`: returns account status, plan, limits, and support flags.
  - `getRecentTransactions`: returns recent transactions and known failure reasons.
- Add useful extra tools if time allows:
  - `getOpenTickets`
  - `createSupportTicket`
  - `summarizeAccountIssue`
- Keep tool outputs explicit and typed so support answers can explain what data was used.
- Add handoff behavior when the tool data indicates a blocked account, repeated failures, identity issues, or missing customer records.

### 9. Guardrails And Human Redirect Bonus

- Add a lightweight Guardrails Agent before routing or as the first router step.
- Detect unsafe requests, prompt injection attempts, requests for secrets, and abuse.
- Add a human redirect result type for cases where the app should create a support ticket instead of generating a final answer.
- Surface handoff status in the dashboard and chat UI.

### 10. Frontend Chat Interface

- Replace the template UI in `src/App.tsx` with authenticated app shell navigation.
- Add a chat page using `@ai-sdk/react` and a `DefaultChatTransport` pointed at `/api/chat`.
- Render message parts, streaming status, tool activity, errors, and source citations.
- Show conversation history in a sidebar.
- Allow users to start a new chat, resume previous chats, and retry failed responses.
- Keep the challenge-compatible API tester only if useful for development, otherwise replace it with a polished chat experience.

### 11. Dashboard

- Add a dashboard page for authenticated admins/operators.
- Show high-level metrics:
  - total conversations
  - messages per day
  - router decisions by category
  - average response latency
  - failed tool calls
  - support handoffs
  - most-used knowledge sources
- Add recent conversation inspection with agent route, tools used, and final response.
- Add ingestion status for each InfinitePay source URL.

### 12. Testing Strategy

- Add unit tests with `bun test` for router classification, schema validation, database repositories, and support tools.
- Add RAG tests using fixed sample chunks to verify retrieval returns relevant InfinitePay content.
- Add API tests for authenticated and unauthenticated requests.
- Add agent orchestration tests with mocked AI SDK model responses and mocked tools.
- Add a short manual test checklist for the exact scenarios in `CHALLENGE.md`.
- Document future comprehensive integration testing with Docker Compose, seeded Postgres, mocked model provider, and browser-level chat tests.

### 13. Docker And Local Operations

- Add a production `Dockerfile` for the Bun app.
- Add `docker-compose.yml` with the app and Postgres.
- Include database migration and ingestion commands in the README.
- Add health checks for the app and database.
- Document required environment variables and provide a safe `.env.example`.

### 14. Documentation

- Expand `README.md` to include:
  - challenge overview
  - architecture diagram or sequence flow
  - setup instructions
  - environment variables
  - database setup
  - RAG ingestion flow
  - API examples
  - testing commands
  - Docker commands
  - explanation of AI SDK usage
  - known tradeoffs and future work

### 15. WhatsApp Integration

- Add a provider-agnostic channel adapter interface before implementing the first messaging provider.
- Implement WhatsApp webhook verification and inbound message handling.
- Map WhatsApp sender ids to `external_channel_accounts` and authenticated users when possible.
- Reuse the same orchestrator used by `/api/chat`.
- Persist inbound and outbound WhatsApp messages in the same `conversations` and `messages` tables with `channel = 'whatsapp'`.
- Add delivery status handling and dashboard visibility.

### 16. Telegram Integration

- Add Telegram bot webhook support after WhatsApp is working.
- Map Telegram chat ids to `external_channel_accounts`.
- Reuse the channel adapter interface and swarm orchestrator.
- Persist Telegram conversations with `channel = 'telegram'`.
- Add Telegram-specific formatting and retry handling.

## Suggested Build Order

1. API foundation, Clerk auth, and database migrations.
2. Conversation/message persistence.
3. Router Agent and challenge-compatible `/api/swarm` endpoint.
4. Customer Support Agent with two database-backed tools.
5. Knowledge ingestion and RAG retrieval.
6. Streaming `/api/chat` endpoint and React chat UI.
7. Dashboard metrics and run inspection.
8. Tests, Docker, and README.
9. Guardrails and human handoff polish.
10. WhatsApp, then Telegram.

## Key Tradeoffs To Revisit

- Postgres scope: use Postgres from the start, including local Docker Compose. Add `pgvector` when implementing semantic retrieval.
- Direct orchestration vs queue: use direct calls now; add a queue later only when external channels need async retries.
- One endpoint vs separate endpoints: keep `/api/chat` for the frontend and `/api/swarm` for challenge compatibility.
- Full admin dashboard vs minimal dashboard: start with metrics and recent runs, then add deeper inspection if time allows.
- Web search scope: keep it separate from InfinitePay RAG so product answers stay grounded in official source pages.
