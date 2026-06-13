# AGENTS.md — Guidance for AI agents working in Maverick Agent

## Golden Rules

1. **bun, never npm/yarn/pnpm.** `bun install`, `bun run`, `bunx`, `bun test`.
2. **No hardcoded API keys.** Keys come from `.env` or config files.
3. **Every public function needs a test.** Coverage = CI gate.
4. **Prefer modular atomic files** over monolithic files. One concern per module.

## Conventions

- TypeScript everywhere
- `zod` for input validation on every tool and API boundary
- `bun test` with `vitest` for testing
- CLI built with `commander`

## Adding a new tool

1. Create `src/tools/<name>.ts` — export a Zod schema + execute function
2. Register it in `src/tools/registry.ts`
3. Write a test in `src/tools/<name>.test.ts`
4. Add documentation to the tool's description (what LLMs see when choosing tools)

## Testing

- `bun test` — runs vitest
- `bun test --coverage` — coverage report
- Mocks at module level via `vi.mock()`, not global overrides
