# CiteSeer Agent Guide

## Non-Negotiable Validation

- You must verify `pnpm merge-checks` exits successfully before declaring a change finished.
- If checks fail, report exact failing command(s) and fix if in scope.

## Tech Stack and Runtime

- Framework: Svelte 5 + SvelteKit 2 + TypeScript.
- Styling: Tailwind CSS v4.
- Package manager: `pnpm` (use `pnpm`, not `npm`).
- Database: PostgreSQL with Drizzle ORM.
- Auth: Better Auth.
- Demo mode data: SQLite file at `data/demo.db` (read-only path in demo helpers).

## Project Landmarks

- App routes: `src/routes`
- API routes: `src/routes/api/**/+server.ts`
- DB access and schema: `src/lib/server/db/index.ts`, `src/lib/server/db/schema.ts`
- Auth: `src/lib/auth.ts`
- Query/LLM pipeline: `src/routes/api/query/+server.ts`, `src/lib/server/compiler/**`
- Demo mode: `src/lib/server/demo/**`

## Setup and Environment Notes

- Initial setup: `pnpm setup`
- Local dev server: `pnpm dev`
- `scripts/setup.ts` may create `.env`, start Docker Postgres, and run Drizzle push.
- Required env vars for auth/db flows include:
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`

## MCP Tools

### Svelte MCP (Required Workflow)

When asked about Svelte or SvelteKit topics, use these tools in order:

1. `list-sections` first
   - Discover relevant docs sections (title, use_cases, path).
2. `get-documentation` second
   - Fetch every section relevant to the task after reviewing `use_cases`.
3. `svelte-autofixer` for Svelte code changes
   - Run it whenever writing Svelte code.
   - Repeat until it returns no issues/suggestions.
4. `playground-link` (conditional)
   - Ask the user if they want a playground link after code is complete.
   - Only generate after explicit user confirmation.
   - Never generate if code was written directly to project files.
