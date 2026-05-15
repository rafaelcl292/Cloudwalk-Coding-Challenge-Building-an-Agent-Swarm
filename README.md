# CloudWalk Agent Swarm Challenge

This repository is a Bun + React implementation of the CloudWalk coding challenge for building an authenticated multi-agent swarm. The application will expose a challenge-compatible JSON API, a customer-facing chat UI, and an operator dashboard backed by Postgres.

## Demo

Watch a demonstration of the app: https://www.youtube.com/watch?v=ecdub6r8eWQ

## Stack

- Bun runtime with `Bun.serve()` for the API and frontend.
- React 19 and Tailwind CSS for the web UI.
- Clerk for React sessions and backend API authentication.
- Postgres with Bun SQL for persistence and future pgvector retrieval.
- AI SDK with the AI Gateway provider for agent orchestration, streaming, tools, and future RAG flows.
- Zod for request, tool input, and structured output validation.

## Getting Started

Install dependencies:

```bash
bun install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Start the development server:

```bash
bun run dev
```

Build for production:

```bash
bun run build
```

Run tests:

```bash
bun test
```

## AWS Deployment

This repo includes a small AWS ops script for the current `us-east-2` deployment. It uses the local `.env` values, adds `NODE_ENV=production`, points `DATABASE_URL` at the RDS instance, uploads a release tarball to S3, replaces the EC2 app instance, runs migrations/seeds, and waits for `/api/health`.

The local `.aws-deploy.json` file stores AWS resource IDs and the generated RDS password. It is intentionally ignored by git.

Deploy a new version:

```bash
bun run aws:deploy
```

Check what is running:

```bash
bun run aws:status
```

Put the system down while keeping database data:

```bash
bun run aws:down
```

This terminates the app EC2 instance and stops RDS. AWS can automatically restart a stopped RDS instance after 7 days.

Permanently destroy the app and database:

```bash
bun run aws:destroy
```

`aws:destroy` deletes the RDS instance without a final snapshot.

Start local Postgres and apply the database schema:

```bash
docker compose up -d postgres
bun run db:migrate
bun run db:seed
bun run rag:ingest
```

Run linting and formatting:

```bash
bun run lint
bun run fmt
```

## Configuration

The app expects the environment variables listed in `.env.example`. Configure either direct OpenAI or Vercel AI Gateway credentials.

- `OPENAI_API_KEY` authenticates direct OpenAI calls through `@ai-sdk/openai`.
- `OPENAI_MODEL` selects the direct OpenAI model for agent responses, for example `gpt-5.5`.
- `OPENAI_EMBEDDING_MODEL` selects the direct OpenAI embedding model, for example `text-embedding-3-small`.
- `AI_GATEWAY_API_KEY` authenticates AI SDK calls through Vercel AI Gateway.
- `AI_GATEWAY_MODEL` selects the AI Gateway model for agent responses, for example `openai/gpt-5.5`.
- `AI_GATEWAY_EMBEDDING_MODEL` selects the AI Gateway embedding model. The default example uses `openai/text-embedding-3-small`, which matches the current 1536-dimension pgvector column.
- `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined into the React client by Bun.
- `CLERK_SECRET_KEY` is used by server-side auth verification.
- `DATABASE_URL` points to the Postgres database.
- `APP_URL` is the public application URL used for callbacks and links.
- `PORT` selects the local HTTP port.

## Database

Local development uses `docker-compose.yml` with the `pgvector/pgvector` Postgres image and a persistent `postgres-data` volume. SQL migrations live in `db/migrations` and are applied in filename order by `bun run db:migrate`. Seed data for realistic support-agent tools lives in `db/seeds` and is loaded with `bun run db:seed`.

The server database layer is in `src/server/db`. It exposes the shared Bun SQL client, typed row shapes, and repository modules for users, conversations, messages, agent runs, tool calls, knowledge sources/chunks, customer support data, and dashboard metrics.

## RAG Knowledge Base

`bun run rag:ingest` fetches the InfinitePay URLs listed in `CHALLENGE.md`, extracts readable text, chunks it, optionally embeds chunks through the configured provider, and stores them in Postgres. If no embedding model is configured, ingestion still stores chunks and the retrieval path falls back to lexical scoring.

The Knowledge Agent exposes a `retrieveKnowledge` tool and is instructed to answer InfinitePay product questions from retrieved source snippets. General web questions use a separate `webSearch` tool so fresh or off-domain questions do not pollute the InfinitePay knowledge base.

Run the challenge scenario report with real agent calls:

```bash
bun run challenge:e2e
```

This command requires either `OPENAI_API_KEY` plus `OPENAI_MODEL`, or `AI_GATEWAY_API_KEY` plus `AI_GATEWAY_MODEL`; the swarm does not generate agent responses without model credentials. It prints every model response for human review and exits with a non-zero status if routing, required tools, sources, handoff flags, or empty-response checks fail.

## Frontend

The web client is an editorial-fintech, dark-themed React SPA called _The Swarm Review_. After signing in through Clerk, users land in a chat console that frames each assistant turn as a typeset article: a route-plan masthead (category, confidence, and the agents that wrote it), a drop-cap article body, and a marginalia rail listing the route's rationale, required tools, and cited sources. Handoff cases render a clearly marked editor's note instead of an answer. The UI is built on Tailwind v4 with a custom `@theme` palette (warm off-black canvas, parchment ink, vermilion accent) and pairs Fraunces, General Sans, and JetBrains Mono. Chat is wired directly to the existing `/api/swarm` JSON endpoint with the user's Clerk bearer token; the `user_id` field used for support routing is editable in the sidebar and defaults to `client789`.

## Customer Support Tools

The Customer Support Agent uses typed AI SDK tools backed by seeded Postgres data: `getCustomerProfile`, `getRecentTransactions`, `getOpenTickets`, `createSupportTicket`, and `summarizeAccountIssue`. The summary path marks handoff when the account is blocked, under review, missing, identity-sensitive, or showing repeated transaction failures.

## Implementation Notes

Project setup follows the repository's local AI SDK and Clerk skill guidance. For AI SDK work, this project uses `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/gateway`, and Zod. The swarm uses three challenge-facing agents: Router, Knowledge, and Customer Support. The Router creates a typed route plan, the orchestrator executes selected agents through direct internal calls, and each downstream agent receives prior agent answers as context so agents can communicate without an external queue. The Knowledge Agent owns both InfinitePay RAG retrieval and web search; the Support Agent owns customer-data tools. For Clerk, this React SPA wraps the root app in `ClerkProvider`, uses `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY` on the client, sends `getToken()` bearer tokens to protected APIs, and verifies sessions server-side with `@clerk/backend`.

The full build plan is tracked in `PLAN.md`.
