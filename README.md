# CloudWalk Agent Swarm Challenge

This repository is a Bun + React implementation of the CloudWalk coding challenge for building an authenticated multi-agent swarm. The application will expose a challenge-compatible JSON API, a customer-facing chat UI, and an operator dashboard backed by Postgres.

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

Start local Postgres and apply the database schema:

```bash
docker compose up -d postgres
bun run db:migrate
bun run db:seed
```

Run linting and formatting:

```bash
bun run lint
bun run fmt
```

## Configuration

The app expects the environment variables listed in `.env.example`.

- `AI_GATEWAY_API_KEY` authenticates AI SDK calls through Vercel AI Gateway.
- `AI_GATEWAY_MODEL` selects the default model for agent responses.
- `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY` is inlined into the React client by Bun.
- `CLERK_SECRET_KEY` is used by server-side auth verification.
- `DATABASE_URL` points to the Postgres database.
- `APP_URL` is the public application URL used for callbacks and links.
- `PORT` selects the local HTTP port.

## Database

Local development uses `docker-compose.yml` with the `pgvector/pgvector` Postgres image and a persistent `postgres-data` volume. SQL migrations live in `db/migrations` and are applied in filename order by `bun run db:migrate`. Seed data for realistic support-agent tools lives in `db/seeds` and is loaded with `bun run db:seed`.

The server database layer is in `src/server/db`. It exposes the shared Bun SQL client, typed row shapes, and repository modules for users, conversations, messages, agent runs, tool calls, knowledge sources/chunks, customer support data, and dashboard metrics.

## Implementation Notes

Project setup follows the repository's local AI SDK and Clerk skill guidance. For AI SDK work, this project uses `ai`, `@ai-sdk/react`, `@ai-sdk/gateway`, and Zod, with later agent code expected to verify APIs against installed docs or source before use. For Clerk, this React SPA wraps the root app in `ClerkProvider`, uses `BUN_PUBLIC_CLERK_PUBLISHABLE_KEY` on the client, sends `getToken()` bearer tokens to protected APIs, and verifies sessions server-side with `@clerk/backend`.

The full build plan is tracked in `PLAN.md`.
