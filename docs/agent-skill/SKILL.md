---
name: startx
description: Conventions for writing code in a startx monorepo (pnpm + Turborepo TypeScript workspace with apps/, packages/, configs/). Use when adding or modifying a workspace package, adding a dependency, writing a core-server endpoint, writing frontend data fetching with useApi/ApiSchema, adding a web-client page, or before claiming the build/lint/test suite passes. Also use when the user mentions startx, `startx init`, `startx package new`, or `startx package add`.
---

# startx monorepo

Read `AGENTS.md` at the workspace root first — it is the full reference. This skill is the short
form and the checklist.

## Before claiming anything passes

```bash
pnpm exec turbo typecheck lint test build format:check --force
```

`--force` is mandatory. Turbo replays cached passes, so a broken suite reports green without it.
`build` dependsOn `lint` and `typecheck` dependsOn `build`, so one lint error blocks everything —
fix lint first.

## The five mistakes agents actually make here

1. **Literal version ranges.** If the dependency is in the `catalog:` block of
   `pnpm-workspace.yaml`, write `"catalog:"`. Internal packages are `"workspace:^"`.
2. **Importing `@repo/lib` as a barrel.** It exports submodules: `@repo/lib/token-module`,
   `@repo/lib/hashing-module`, `@repo/lib/validation-module`, `@repo/lib/extra`. The root export is
   almost empty.
3. **Reinventing a shared package.** Check the table in `AGENTS.md` §4 before reaching for `bcrypt`,
   `jsonwebtoken`, `ioredis`, `bullmq`, `nodemailer`, `node:fs` or an LLM SDK — each already has a
   wrapper, and the wrapper is what the rest of the code expects.
4. **`process.env` and `console.log`.** Use `defineEnv` / `envBool` from `@repo/env`, and `logger`
   from `@repo/logger`. Never `z.coerce.boolean()` — it turns the string `"false"` into `true`.
5. **Assuming a green `test` task means tests ran.** `passWithNoTests: true`. Only
   `packages/@repo/lib` and `configs/eslint-config` have real suites.

## Adding a package

`startx package new @repo/foo` (blank) or `startx package add <template> -n <newname>` (copy a
template, with its dependency closure). Then `pnpm install`. Do not hand-create the directory; if
you must, the exact `tsconfig.json` / `eslint.config.ts` / `vitest.config.ts` lines are in
`AGENTS.md` §3.

## Frontend data fetching

Declare endpoints on a chained `ApiSchema` from `@repo/ui/api`, then `api.getReactQuery(axios)`.
Never call axios or fetch from a component. `data: {} as User` is a **type carrier** for the
response — it is not a payload and is never read at runtime. Paginated endpoints expect the server
to return what `Paginator` from `@repo/lib/extra` produces. Full pattern in `AGENTS.md` §5.

Nothing in the repo consumes `useApi` yet, so there is no call site to copy — follow §5 rather than
inventing a second data layer.

## Backend endpoint

Router factory in `src/routes/<resource>/router.ts` → validate with `RouterValidation` → throw
`ErrorResponse(msg, code)` → mount in `src/routes/server.ts`. Middleware order there is load-bearing
and `errorMiddleware` must keep all four parameters — Express detects error handlers by arity, so
dropping the unused `_next` silently demotes it and hangs every error.

## Formatting

Tabs, print width 120, semicolons, double quotes, trailing comma `all`. Biome is a **formatter only**
(`linter.enabled: false`); ESLint owns linting. Most packages format with biome, but `apps/cli`,
`apps/startx-cli` and `packages/@repo/model` use prettier — check the package's own `format` script.

## Working on startx itself

`apps/startx-cli` is the CLI and this repo is also the template it copies from. Tag semantics
(`gTags` / `iTags` / `tags` / `mode` / `requiredDeps` / `ignore`), the first-match-wins rule that
makes array order in `src/configs/*.ts` semantic, and the fact that a root file with no `FileCheck`
entry ships unconditionally are all in `AGENTS.md` §9. Bugs are tracked in `todo/bugs/bugs.md`.
