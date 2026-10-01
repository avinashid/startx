# AGENTS.md

Instructions for AI coding agents working in a **startx** monorepo. Read this before writing code.

`startx` scaffolds a TypeScript monorepo (pnpm workspaces + Turborepo). This file is shipped into
every generated workspace, so it describes the monorepo you are standing in — whether that is the
startx repo itself or a project scaffolded from it. The last section is the only part specific to
the startx repo.

For human-facing CLI documentation see `README.md`. This file is about writing code that fits.

---

## 0. The gate

One command decides whether your change is done:

```bash
pnpm exec turbo typecheck lint test build format:check --force
```

**`--force` is not optional.** Turbo caches `lint`, `build`, `typecheck` and `test`, and it will
replay a cached PASS without re-running anything. A suite that has been broken for weeks reports
green. Every claim you make about the state of this repo must come from a `--force` run, or it is
not a claim, it is a guess.

Note the dependency chain in `turbo.json`: `build` dependsOn `lint`, and `typecheck` dependsOn
`build`. A single lint error therefore blocks typecheck and build across the whole workspace. Fix
lint first.

`format` and `format:check` are `cache: false`, so they always really run.

---

## 1. Layout

```
apps/          runnable things (core-server, web-client, cli, queue-worker, startx-cli)
packages/      shared libraries — @repo/*, @db/*, ui, common, queue, aix
configs/       shared tool config — typescript-config, eslint-config, vitest-config, tsdown-config
```

`pnpm-workspace.yaml` globs `apps/*`, `packages/*`, `packages/*/*`, `configs/*`. A new directory
matching one of those globs is a workspace package automatically; nothing registers it by hand.

**Apps are built** (tsdown → `dist/`, run via `node dist/index.mjs`). **Libraries are consumed as
TypeScript source** — no build step, no `dist`. An app bundles all its dependencies except those it lists in
`runtimeDependencies([...])` in its `tsdown.config.ts`. Those are written, pinned, to `dist/package.json`, which
is what the Dockerfile installs, so a native or self-resolving package (sharp, `@bull-board/*`) goes there. Do not add a `build` script to a library unless you
are deliberately changing that.

Library `exports` maps vary, so read the one you are importing from rather than guessing. Some are
subpath maps (`@repo/ui`, `@repo/common`: `{ "./*": "./src/*.ts" }`), some expose submodule barrels
(`@repo/lib`: `{ ".": "./src/index.ts", "./*": "./src/*/index.ts" }`), and some are a single root
entry (`@repo/env`, `@repo/logger`, `@repo/redis`, `@repo/mail`: `"./src/index.ts"`).

---

## 2. Rules that will fail CI if you break them

### Dependencies go through the catalog

`pnpm-workspace.yaml` has a `catalog:` block that pins every shared version once.

- Dependency **already in the catalog** → write `"zod": "catalog:"`. Never restate a literal range;
  that is how versions drift apart across the monorepo.
- Dependency **not in the catalog** → add a real range, or add it to the catalog first. Writing
  `"catalog:"` for a name with no catalog entry fails `pnpm install`.
- Internal workspace dependency → `"@repo/lib": "workspace:^"`.

### Two formatters, split by package

`biome.json` has `linter.enabled: false`. **Biome is a formatter here, never a linter. ESLint owns
linting.** Most packages run `biome format --write .` / `biome ci .`; `apps/cli`, `apps/startx-cli`
and `packages/@repo/model` run `prettier --write .` / `prettier --check .` instead. Check the
package's own `format` script before assuming which one applies.

Settled style, identical in `.prettierrc.cjs` and `biome.json`: **tabs**, tab width 2, print width
**120**, semicolons, double quotes, trailing comma `all`, arrow parens `always`, LF.

Two traps:

- Turbo runs the formatter **inside each package**, so a root `.prettierignore` is never read by
  `turbo run format:check`. A package that needs exclusions needs its own `.prettierignore`.
- Biome and prettier still disagree on *line breaking* for generic parameter lists, union types and
  nested CSS values, and neither tool exposes options for it. If a file ping-pongs between the two,
  that is a known open defect, not something you introduced.

### Logging

`logger.info/warn/error` from `@repo/logger`. Not `console.log`. ESLint allows `console.warn`,
`console.error` and `console.info`, and warns on the rest.

### Environment variables

Never read `process.env` directly. Declare a schema with `defineEnv` from `@repo/env`, next to the
code that needs it — there is no single global env file, and that is intentional.

For booleans use `envBool`, never `z.coerce.boolean()` — coercion is `Boolean(value)`, so the string
`"false"` becomes `true`. `envBool` accepts exactly `"true" | "false" | "1" | "0"` and deliberately
rejects `""`: a blank variable is a misconfiguration, and reading it as `false` is how a cluster-mode
deployment quietly connects to a single node.

For keys and signing secrets use `envSecret({ min | length, hex })`, not `z.string().min(32)`. Outside
`NODE_ENV=development|test` it rejects `CHANGE_ME…` and single-repeated-character values, so a
deployment that copied `.env.example` fails at boot instead of signing tokens with a public key.

`NODE_ENV` defaults to `production`, and `.env.example` leaves it out on purpose: that is what makes the
checks above apply to a copied example. The backend `dev` scripts set `NODE_ENV=development` themselves
(via `cross-env`). Do not add `NODE_ENV` back to `.env.example`.

### React imports

In `packages/ui`, import React as a namespace:

```ts
import * as React from "react";        // or: import type * as React from "react";
```

`import React from "react"` / `import type React from "react"` trips `import-x/default` and fails
lint. Do not weaken the rule to make your import work.

---

## 3. Adding a package

Use the CLI. Do not hand-create a package directory.

```bash
startx package list              # what templates exist
startx package new @repo/foo     # blank package, scaffolded for this workspace
startx package add core-server --name api-v2   # copy an existing template, optionally renamed
```

**`startx package new`** writes `package.json` (with `typecheck` and `clean`, plus `format`/
`format:check`, `lint`/`lint:fix` and `test` only if that tooling is detected in the workspace root),
`src/index.ts`, and `tsconfig.json` extending `typescript-config/tsconfig.node.json`. It adds
`eslint.config.ts` and `vitest.config.ts` only if ESLint / vitest are present. Default location is
`packages/<scope>/<name>`; override with `-d`.

**`startx package add`** copies a real template package instead of generating a blank one, resolves
the full `requiredDeps` / `requiredDevDeps` closure by BFS, reconciles `catalog:` entries against
your `pnpm-workspace.yaml`, and offers to install any missing root dependencies.

Either way, **run `pnpm install` afterwards** — the workspace glob picks the package up, but the link
does not exist until you install.

Flags worth knowing: `--eslint` / `--no-eslint` force the ESLint decision, `--no-install` skips the
package manager, `-n, --name` renames on copy.

### Wiring a new package by hand

If you do add files yourself, these are the exact lines. Copy them; do not improvise:

```jsonc
// tsconfig.json
{ "extends": "typescript-config/tsconfig.node.json" }   // or tsconfig.frontend.json
```

```ts
// eslint.config.ts
import { baseConfig } from "eslint-config/base";        // or frontendConfig from "eslint-config/frontend"
import { extend } from "eslint-config/extend";
export default extend(baseConfig);
```

```ts
// vitest.config.ts
import vitestConfig from "vitest-config/node";          // or "vitest-config/frontend"
export default vitestConfig;
```

---

## 4. Use the shared package, do not reinvent it

Reaching for a raw npm library when one of these exists is the single most common way an agent
produces wrong-looking code here.

| Need | Use | Not |
|---|---|---|
| Password hashing | `@repo/lib/hashing-module` | `bcrypt` directly |
| JWT access/refresh tokens | `@repo/lib/token-module` | `jsonwebtoken` directly |
| Request validation | `@repo/lib/validation-module` | hand-rolled checks |
| Secrets at rest (AES-256-GCM) | `@repo/lib/encryption-module` | `node:crypto` directly |
| List pagination | `@repo/lib/extra` (`Paginator`) | ad-hoc `limit`/`offset` |
| Cookies | `@repo/lib/cookie-module` | `res.cookie` directly |
| Sessions | `@repo/lib/session-module` | — |
| OTP issue/verify | `@repo/lib/otp-module` | — |
| File/JSON/YAML I/O | `@repo/lib/file-system-module` (`fsTool`) | `node:fs` directly |
| File storage (s3/local) | `@repo/lib/storage-module` | AWS SDK directly |
| Typed API errors | `@repo/lib/error-handlers-module` (`ErrorResponse`) | `throw new Error` |
| Graceful shutdown (SIGTERM/SIGINT) | `@repo/lib/shutdown-module` (`onShutdown`; `trackHttpServer(server)` right after `listen()` for an HTTP drain that does not wait out keep-alive) | `process.on("SIGTERM")` directly |
| Env parsing | `@repo/env` (`defineEnv`, `envBool`, `envSecret`) | `process.env` |
| Logging | `@repo/logger` | `console.log` |
| SQLite | `@db/sqlite` (`db`, drizzle on `node:sqlite`) | `better-sqlite3` / raw `node:sqlite` |
| Redis | `@repo/redis` (`getRedis`, `RedisStore`) | `ioredis` directly |
| Background jobs | `@repo/queue` (`BullQueue`, `JobSchemas`) | `bullmq` directly |
| Email templates | `@repo/mail` (`EmailTemplate`) → send via `@repo/lib/mail-module` | `nodemailer` directly |
| Durations / TTLs | `@repo/common/time` (`Time.minutes/hours/days`) | magic numbers |
| LLM / agent features | `aix` | `openai` / bedrock SDKs directly |
| React components | `@repo/ui` (shadcn-based) | new one-off components |

**`@repo/lib` exports submodules, not a barrel.** Its `exports` map is
`{ ".": "./src/index.ts", "./*": "./src/*/index.ts" }` and the root only re-exports `utils.ts`.
Import `@repo/lib/token-module`, not `@repo/lib`.

`@repo/ui` is subpath-exported too: `@repo/ui/components/ui/button`, `@repo/ui/lib/utils`,
`@repo/ui/hooks/use-mobile`, `@repo/ui/api`.

---

## 5. Frontend data fetching — the `useApi` contract

All HTTP from the client goes through `ApiSchema` in `@repo/ui/api`. Do not call `axios` or `fetch`
from a component.

Declare endpoints once with the fluent builder. Each `.fetch()` / `.mutation()` returns a **new**
`ApiSchema` with the key merged into its type, so keep the chain:

```ts
import { ApiSchema } from "@repo/ui/api";
import { z } from "zod";

export const api = new ApiSchema()
	.fetch("getUser", {
		route: "/users/:id",
		method: "GET",
		zParams: z.object({ id: z.string() }),
		data: {} as User,
	})
	.mutation("createUser", {
		route: "/users",
		method: "POST",
		zBody: z.object({ name: z.string() }),
		data: {} as User,
	});

export const useAppApi = api.getReactQuery(axiosInstance);
```

Then in a component:

```ts
const { data, isLoading } = useAppApi("getUser", { params: { id } });
const create = useAppApi("createUser");
```

Things that are not obvious and will cost you an hour:

- **`data` is a type carrier, not a payload.** It is never read at runtime on the fetch path; it only
  gives `ID`, which becomes the `UseQueryResult<ID>` response type. `{} as User` is the idiom.
- `route` is required, `method` is optional. `zParams` types path params, `zQuery` the query string,
  `zBody` the mutation body.
- Four `apiType`s exist: `fetch`, `mutation`, `paginated-fetch`, `infinite-paginated`.
- **Plain and paginated endpoints unwrap differently, and the server must match.** A plain `fetch`
  returns `resp.data` — the response body *is* your typed payload, no envelope. The paginated ones
  return `resp.data.data`, so their body must be:

  ```jsonc
  { "message": "…", "data": { "data": [ /* rows */ ], "pagination": { "total": 0, "totalPages": 0, "currentPage": 1, "pageSize": 10 } } }
  ```

  The inner object is exactly what `Paginator` from `@repo/lib/extra` produces (it also carries an
  optional `other` field). Use them together, and do not wrap a plain `fetch` response in
  `{ message, data }` — it will hand the component the envelope instead of the payload.
- Mutations take `onSuccess` / `onError` / `onFetch` / `refetch` event blocks that can invalidate,
  refetch or clear other query keys by name. Prefer those over manual cache juggling.
- `useApiControl` (`api.getQueryControl(axios)`) is for imperative cache access from outside the
  query hook — `invalidate`, `refetch`, `getData`, `setData`, `remove`, `mutate`. To call `mutate`
  you **must** pass an axios instance as the second argument; it throws at runtime otherwise.
- `QueryProvider` from `@repo/ui/api` must wrap the app. In `web-client` it is already wired in
  `src/root.tsx`.

**Status: nothing in this repo consumes `useApi` yet.** No `ApiSchema` is declared anywhere; only
`QueryProvider` is wired. The example above is derived from the builder's real signatures, not copied
from a call site. You are probably writing the first one — follow the pattern rather than inventing
a parallel data layer.

### Adding a page (`web-client`)

React Router v7 in framework mode, config-based — **not** file-system routing. Create
`src/routes/<name>.tsx`, then register it in `src/routes.ts` with `route("path", "routes/name.tsx")`.
Creating the file alone does nothing.

---

## 6. Backend — adding an endpoint (`core-server`)

1. Create `src/routes/<resource>/router.ts` exporting a `createXRouter(): Router` factory.
2. Validate input with `RouterValidation` from `@repo/lib/validation-module` — `.decorator.body`,
   `.decorator.params`, `.decorator.query`, or the `.fn.*` equivalents. It throws
   `ErrorResponse(…, 422)` on failure.
3. Guard with `AuthMiddlewares.validateActiveSession` where the route is not public.
4. Throw `ErrorResponse(message, statusCode)` for handled failures — `errorMiddleware` catches it.
5. Mount it in `src/routes/server.ts` with `app.use("/<resource>", createXRouter())`.
6. New env vars go through `defineEnv`, either in `src/config/server-config.ts` or module-local.

**Middleware order in `server.ts` is load-bearing**: helmet → rate limit → cors → cookie/body parsers
→ upload → routers → `notFoundMiddleware` → `errorMiddleware` **last**.

The limiter sits ahead of cors so that rejected origins are throttled too. Because its 429 is written
before cors runs, the limiter's handler adds the CORS headers itself for an allowed origin (so the
frontend can read the 429 and `Retry-After`), and it skips preflights from allowed origins only. A
middleware you add ahead of cors that answers requests itself has to do the same.

`uploadMiddleware` is mounted globally but only parses multipart for a request with a valid session
(bearer token): an anonymous multipart request gets a 401 before its body is read. A public upload
route therefore needs its own parser, mounted ahead of the global one.

**`errorMiddleware` must keep all four parameters**, including the unused `_next`. Express detects
error handlers by arity alone; dropping the fourth parameter silently demotes it to ordinary
middleware and every error becomes a hung request.

`src/config/server-config.ts` centralises body-size, upload, rate-limit and trust-proxy config.
`rate-limit-middleware.ts` uses an in-memory store — it is per-replica, so a multi-replica deployment
needs a Redis-backed store.

The limiter keys on `req.ip`, so `TRUST_PROXY` decides who shares a bucket. The default `loopback`
only trusts a proxy on the same host; behind an ALB or a proxy in another container, set it to the
hop count (`1`). The server logs one warning the first time it sees an `X-Forwarded-For` it ignored.

---

## 7. Tests

Vitest, co-located: `src/**/*.{test,spec}.{ts,tsx}`. `passWithNoTests: true`, so a package with no
tests still passes `turbo test` — a green `test` task does **not** mean tests exist.

To opt a package in: add `vitest.config.ts` (see §3) and `"test": "vitest run"`.

Real test suites today live in `packages/@repo/lib` and `configs/eslint-config`. Everything else is
untested; if you change behaviour elsewhere, you are the first test.

---

## 8. Things that look broken but are just unwired

Do not "fix" these by deleting them, and do not assume they work because they exist:

- `@repo/model` — `src/index.ts` is empty. A placeholder for shared DTOs, with no consumers.
- `@db/drizzle` — fully configured (schema in `src/schema/`, `db` singleton, `db:push` / `db:studio`)
  but no app imports it yet. There is no `db:generate` or migrate script.
- `@db/sqlite` — the same shape on Node's built-in `node:sqlite` (Node ≥ 22.13, no native build).
  A relative `SQLITE_DB_PATH` (default `data/app.db`) resolves against the workspace root, so
  `db:push` and every app open the same file. No app imports it yet.
- `useApi` / `ApiSchema` — see §5. Built, exported, unconsumed.

---

## 9. If you are working on the startx repo itself

Skip this section in a generated workspace.

The repo is **both the CLI and the template it scaffolds from**. `apps/startx-cli` copies a selected
subset of this repo's own `apps/`, `packages/`, `configs/` and root dotfiles into the user's new
workspace. A weak default here ships to every downstream project.

**Metadata lives in each template package's own `package.json` under a `startx` key** (typed in
`apps/startx-cli/src/types.ts`) and is always stripped from the emitted output. It is only ever read
from the bundled template directory, never from a user's workspace.

- `gTags` — broadcast into the global tag set once the package is selected; affects every later
  package.
- `iTags` — gate. The package is only offered if `iTags ⊆ current global tags`. Not itself added.
- `tags` — the package's own tags, merged only into its own install tag set. Not broadcast.
- `mode: "silent"` — never offered interactively, but still reachable through the dependency closure.
- `mode: "standalone"` — forced `runnable`, and excluded from an app's auto-wired `workspace:^` deps.
- `requiredDeps` / `requiredDevDeps` — the BFS closure, and force-added as `workspace:^`.
- `ignore` — dependency, config or script names stripped from the emitted package.

**Array order in `src/configs/scripts.ts`, `files.ts` and `deps.ts` is semantic, not cosmetic.**
Selection is first-match-wins:

```ts
value.find(e => e.tags.every(t => currentTags.has(t)))
```

The arrays are ordered most-specific-first. Reordering them silently changes which script a generated
package receives, with no error anywhere.

**A root file absent from `FileCheck` in `files.ts` is copied unconditionally.** Adding a file to the
repo root without a `FileCheck` entry ships it to every generated workspace. Tag it `["never"]` if it
is repo-local.

Open defects and enhancements are tracked in `todo/` — `todo/bugs/bugs.md` is the register, with
detail files per category. Keep it current; a status line in there must come from a `--force` run.
