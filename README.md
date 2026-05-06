# CloudWalk Agent Swarm Challenge

This repository is a Bun + React implementation of the CloudWalk coding challenge for building an authenticated multi-agent swarm. The application will expose a challenge-compatible JSON API, a customer-facing chat UI, and an operator dashboard backed by Postgres.

## Stack

- Bun runtime with `Bun.serve()` for the API and frontend.
- React 19 and Tailwind CSS for the web UI.
- Clerk for React sessions and backend API authentication.
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

Run linting and formatting:

```bash
bun run lint
bun run fmt
```

## Configuration

The app expects the environment variables listed in `.env.example`.

- `AI_GATEWAY_API_KEY` authenticates AI SDK calls through Vercel AI Gateway.
- `AI_GATEWAY_MODEL` selects the default model for agent responses.
- `VITE_CLERK_PUBLISHABLE_KEY` is used by the React client.
- `CLERK_SECRET_KEY` is used by server-side auth verification.
- `DATABASE_URL` points to the Postgres database.
- `APP_URL` is the public application URL used for callbacks and links.
- `PORT` selects the local HTTP port.

## Implementation Notes

Project setup follows the repository's local AI SDK and Clerk skill guidance. For AI SDK work, this project uses `ai`, `@ai-sdk/react`, `@ai-sdk/gateway`, and Zod, with later agent code expected to verify APIs against installed docs or source before use. For Clerk, this React SPA uses the current `@clerk/react` package and the `VITE_CLERK_PUBLISHABLE_KEY` client environment variable, while server auth will use `@clerk/backend`.

The full build plan is tracked in `PLAN.md`.
