# Template enhancements

Improvements to the template apps, packages and shared configs — the code that gets copied into
every scaffolded project.
Register: [`enhancements.md`](enhancements.md).

Contents: [E2](#e2) · [E7](#e7) · [E8](#e8) · [E9](#e9) · [E10](#e10)

---

## E2

### E2 · Promote accumulating lint warnings to errors

- **Status:** open · **Value:** high · **Effort:** S
- **Area:** `configs/eslint-config`

**Today** — `turbo lint` reports roughly **90 warnings** and zero errors. Warnings don't fail
anything, so they accumulate. Seven of them have already been promoted to build-breaking
`TS6133` errors by `tsc` — that's [B12.4](../bugs/type-bugs.md#b124), which only exists because the
warnings were ignored long enough to matter.

Current distribution:

| Rule | ~count | Assessment |
|---|---|---|
| `@typescript-eslint/naming-convention` | ~25 | Mostly false positives: Tailwind class keys (`px-3 py-2`), CSS custom properties (`--sidebar-width`), size variants (`icon-sm`) |
| `@typescript-eslint/no-explicit-any` + `no-unsafe-*` | ~30 | Real, concentrated in `@repo/lib` and `ui` |
| `unused-imports/no-unused-vars` | ~7 | **Real, and already breaking typecheck** |
| `react-hooks/exhaustive-deps` | 3 | Real, in `ui` |
| `jsx-a11y/*` | 2 | Real, in `ui` |
| Unused `eslint-disable` directives | 4 | Trivially removable |
| `eqeqeq` | 1 | Real |

**What to do** — Not a blanket promotion; that would fail the build on ~90 sites at once.

1. **`unused-imports/no-unused-vars` → `error`** immediately. It is already breaking `tsc`, so the
   only new information is *when* you find out.
2. **Fix and remove the 4 unused `eslint-disable` directives** and the single `eqeqeq` site.
3. **Scope `naming-convention`** so object literal properties are exempt in `.tsx` files, or add a
   `filter` for kebab-case and CSS-variable keys. Roughly a quarter of the noise disappears and the
   rule starts meaning something again.
4. **Cap `no-explicit-any`** rather than fixing all 30 at once: set it to `error` with a per-file
   `eslint-disable` in the worst offenders, then burn them down. A warning nobody acts on is worse
   than no rule.
5. **`react-hooks/exhaustive-deps` → `error`** — these are genuine stale-closure risks in
   `use-debounce.tsx:10` and `multiple-select.tsx:272`.

Add `--max-warnings=0` to the `lint` script only after steps 1–4 land.

**Done when** — `turbo lint` reports zero warnings, and new ones fail CI.

---

## E7

### E7 · Shared env coercion helpers in `@repo/env`

- **Status:** open · **Value:** medium · **Effort:** S
- **Area:** `packages/@repo/env`

**Today** — Every package writes its own Zod schema for environment variables, and at least one got
it wrong in a way that silently inverts behaviour: [B6](../bugs/runtime-bugs.md#b6), where
`z.coerce.boolean()` makes the string `"false"` evaluate to `true`.

`z.coerce.boolean()` is `Boolean(value)`. Environment variables are always strings. **Every non-empty
string is truthy.** This will recur every time someone adds a boolean flag.

**What to build** — Export typed helpers from `@repo/env` and use them everywhere:

```ts
export const envBool = (def = false) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(def ? "true" : "false")
    .transform((v) => v === "true" || v === "1");

export const envPort = () => z.coerce.number().int().min(1).max(65535);

export const envUrl = () => z.string().url();
```

`envBool` deliberately excludes `""` from the enum: a blank env var is treated as a misconfiguration
and rejected rather than silently read as `false`.

Then sweep the repo for `z.coerce.boolean()` and replace. Add an `eslint-config` rule banning
`z.coerce.boolean` outright — the repo already ships 10 custom rules, so the machinery exists.

While here, two related items in the same package:
- `PORT` is `z.string()` in `default-env.ts:9`, so `app.listen(ENV.PORT)` passes a string. It works,
  but `envPort()` would validate it.
- `CLIENT_URL`, `SERVER_URL` and `CORS_URL` are plain `z.string()` with localhost defaults, so a
  deployment that forgets to set them gets a silently wrong CORS allowlist rather than an error.
  Consider requiring them when `NODE_ENV !== "development"`.

There is now a second, concrete reason to build this: [B41](../bugs/runtime-bugs.md#b41). Fixing B6
and hardening the cookie module were done independently, and the two landed on incompatible boolean
dialects — `@repo/redis` accepts a strict, case-sensitive `z.enum(["true","false","1","0"])`, while
`@repo/lib` accepts a lenient, case-insensitive set that also takes `yes`/`no`/`on`/`off`, and the
two throw different error types. That divergence is the predictable result of having no shared
helper, and this enhancement is the fix for it.

**Done when** — No `z.coerce.boolean()` remains, `REDIS_CLUSTER_MODE=false` means false, and every
boolean env var in the template accepts the same spellings and fails the same way (closing B41).

---

## E8

### E8 · Unit tests for the pure template logic

- **Status:** open · **Value:** medium · **Effort:** M
- **Area:** `packages/@repo/lib`, `packages/common`

**Today** — 24 tests exist, all in `eslint-config`. Every shared library ships untested, including
several modules that are pure, dependency-free and trivially testable.

**Where the value is, in order**

| Module | File | Why it's first |
|---|---|---|
| `Paginator` | `@repo/lib/src/extra/pagination-module.ts` | Pure, takes user-controlled input, currently unvalidated ([B27](../bugs/function-bugs.md#b27)) |
| `Time` | `packages/common/src/time.ts` | Pure arithmetic; a unit confusion here already caused [B3](../bugs/function-bugs.md#b3) |
| `EncryptionModule` | `@repo/lib/src/encryption-module/` | Round-trip, tamper-detection, malformed-payload cases |
| `HashingModule` | `@repo/lib/src/hashing-module/` | Trivial, but pins the bcrypt cost factor |
| `FileHandler.handlePackageJson` | `startx-cli/src/utils/file-handler.ts` | Pure function, drives everything — see [E1](cli-enhancements.md#e1) |
| `ITokenModule` | `@repo/lib/src/token-module/` | Sign/verify/expiry/wrong-secret |

`Time` deserves a specific test given B3: assert `Time.minutes(5).seconds === 300` and
`Time.minutes(5).milliseconds === 300000`, so the two are visibly distinct in the test output.

The modules that need Redis (`OTPModule`, session) want `ioredis-mock` or a testcontainer — leave
those for a second pass.

**Done when** — Every pure module in `@repo/lib` and `packages/common` has a test file, and
`turbo test` runs more than 24 tests.

---

## E9

### E9 · Revisit `typecheck.dependsOn: ["build"]` in `turbo.json`

- **Status:** open · **Value:** medium · **Effort:** S
- **Area:** `turbo.json`

**Today**
```jsonc
"build":     { "dependsOn": ["lint", "^build"] },
"typecheck": { "dependsOn": ["^typecheck", "build"] },
```

Running `pnpm typecheck` therefore runs **lint and a full build of every package first** — including
a complete Vite/React Router production build of `web-client`, fonts and all. A cold
`turbo typecheck` takes **1m 46s**, the large majority of it spent building things typechecking does
not need.

It also means one package's broken lint config fails typecheck for the whole repo
([B8](../bugs/config-bugs.md#b8)), which conflates three independent signals into one.

**Why it's like this** — Presumably because packages export raw `.ts` via their `exports` maps, so
consumers typecheck against source, not `.d.ts`. In that arrangement `build` is genuinely not
required for `typecheck` — `^typecheck` alone is enough.

**What to do**

1. Drop `"build"` from `typecheck.dependsOn`, leaving `["^typecheck"]`.
2. Run `turbo typecheck` from clean and confirm nothing regresses. If something does, it will be a
   package that genuinely consumes built output — fix that package's `exports` instead of restoring
   the global dependency.
3. Drop `"lint"` from `build.dependsOn` too. Lint is a quality gate, not a build input; CI should run
   `turbo lint` as its own job. This also makes B8-style failures legible.

Expect `turbo typecheck` to drop to a few seconds warm.

**Done when** — `turbo typecheck` no longer triggers `build` or `lint`, and all three commands can
fail independently.

---

## E10

### E10 · Document the tag model in the user-facing README

- **Status:** open · **Value:** medium · **Effort:** S
- **Area:** `README.md`

**Today** — The root `README.md` documents the commands, the flags and the template catalogue
thoroughly. It says **nothing** about `gTags` / `iTags` / `tags` / `mode` / `requiredDeps` /
`ignore` — the mechanism that decides what actually gets generated.

That matters for two audiences:
- Anyone adding a template to this repo has to reverse-engineer the model from `init.ts`.
- Anyone debugging a surprising scaffold result (why did my frontend get `tsc --noEmit`?) has no
  documented model to reason against.

**What to write** — Port §2 of [`../README.md`](../README.md#2-the-orchestration-model) into the
user-facing README as a "How templates are selected" section: the six metadata fields, the
`entry.tags ⊆ currentTags` predicate, and the three lookup tables (`FileCheck`, `DepCheck`,
`scripts`). Add a worked example showing which tags a `core-server` + `web-client` workspace ends up
with.

Also fix two smaller README gaps while in there:
- The root `package.json` has an empty `"description"`, and no `homepage` or `bugs` fields — so the
  npm page shows no description. Tracked as [C5](../chores/chores.md#c5).
- The README's `startx package add` section documents `--no-install` as "skip running the package
  manager after adding missing root dependencies", which is accurate, but doesn't mention that
  `init` never installs at all. Worth stating once, prominently.

**Done when** — Someone can add a new template package correctly using only the README.

---

## E14

### E14 · The `cli` app template has no `bin` entry

- **Status:** open · **Value:** low · **Effort:** S
- **Area:** `apps/cli/package.json`

**Today** — The scaffolded CLI builds to `dist/index.mjs` and runs via `node dist/index.mjs`, but it declares no `bin`, so `pnpm link`, `npm i -g` and `npx` can't expose it as a command, which is the point of a CLI template. Found in: runtime smoke `tsk_jv5m7m9a`, 2026-10-01.

**Done when** — `apps/cli/package.json` carries `"bin": { "<name>": "./dist/index.mjs" }` with a shebang, and `handlePackageJson` keeps it (B16 already preserves `bin`).

---

## E15

### E15 · Emit source maps for bundled apps so a crash is readable

- **Status:** open · **Value:** med · **Effort:** S
- **Area:** `configs/tsdown-config`, app `tsdown.config.ts`

**Today** — core-server and queue-worker bundle every dependency into one file. When either crashes at boot, Node echoes the offending source line, which is several kilobytes of bundled code, and the stack points at `dist/index.mjs:781:2211`. Found in: runtime smoke `tsk_jv5m7m9a`, 2026-10-01.

**Done when** — Builds emit `sourcemap: true`, and `start` runs with `--enable-source-maps`, so a boot failure prints the original `src/` location.

---

## E17

### E17 · `@db/sqlite` on drizzle over the built-in `node:sqlite`, without the native `better-sqlite3`

- **Status:** done · **Value:** med · **Effort:** M
- **Area:** `packages/@db/sqlite`, `pnpm-workspace.yaml` (catalog, `allowBuilds`), `.env.example`, `_gitignore`

**Today** — `@db/sqlite` wrapped `better-sqlite3`, a native addon, and `allowBuilds` blocks its build, so it could not load in a fresh scaffold. It also shipped a hand-rolled string-SQL CRUD class and an xlsx→sqlite importer, built on xlsx 0.18.5, the abandoned npm build with known advisories. The README called it "Drizzle ORM with SQLite", but it had no drizzle at all. Requested in chat by Avinash, card `tsk_3pfjh8aw`. He chose to keep it a single package and to drop the CRUD class and the xlsx importer.

**Done when** — `@db/sqlite` exports a drizzle `db` (`drizzle-orm/node-sqlite`) and the raw `sqlite` `DatabaseSync` handle, opened with WAL, `foreign_keys = ON` and `busy_timeout`. It has `src/schema/`, a sqlite `drizzle.config.ts`, the `db:*` scripts (via the `drizzle` tag) and `engines.node >= 22.13`. `SQLITE_DB_PATH` (default `data/app.db`) resolves a relative path against the nearest `pnpm-workspace.yaml`, so `db:push` (cwd = the package) and the apps (cwd = their own dir) open the same file. Outside a workspace it falls back to cwd. better-sqlite3, `@types/better-sqlite3` and xlsx are gone from the catalog, `allowBuilds` and the lockfile.

- **Fixed in:** `a532527`. `path.test.ts` (4) + `client.test.ts` (4: drizzle round trip, FK enforcement, transaction rollback, `increment`).
  - Forced gate: 73/73.
  - Scaffold E2E, from source: `full-biome` 75/75, and `sqlite-server` (core-server + `@db/sqlite`) 40/40.
  - The sqlite-server scaffold installs no better-sqlite3. With no `SQLITE_DB_PATH` set:
    - its `db:push` printed `Using 'node:sqlite' driver` and created `<root>/data/app.db`;
    - a script run from `apps/core-server` wrote and read a `users` row in that same file.

---

## E18

### E18 · `web-client` on React Router 8 (latest) and React 19.3

- **Status:** done · **Value:** med · **Effort:** S
- **Area:** `pnpm-workspace.yaml` (catalog), `apps/web-client`, `packages/ui`

**Today** — the catalog pinned `react-router` and `@react-router/{dev,node,serve}` at `^7.14.0`; 8.4.0 is the latest. Requested in chat by Avinash, card `tsk_p5unkg64`. v8 requires Node ≥ 22.22.0, React ≥ 19.2.7 and Vite 7+, and removes the `v8_*` future flags, `react-router-dom` and `meta`'s `data` argument. web-client used none of those APIs and already targeted ES2022.

**Done when** — the four React Router entries are `^8.4.0`; `react`, `react-dom`, `@types/react` and `@types/react-dom` are `^19.3.0`. web-client declares `engines.node >= 22.22` (package-level, like `@db/sqlite`; the workspace floor stays `>=22`). `@repo/ui` takes `react`/`react-dom` as `catalog:` devDependencies: with only its `^19.0.0` peer, pnpm kept the auto-installed peer at the locked 19.2.4 next to react-dom 19.3.0, a version mismatch React rejects at runtime. Docs say v8.

- **Fixed in:** `ac52654`.
  - Forced gate: 73/73, 0 cached, 263 tests.
  - The lockfile no longer contains `react@19.2.x`. `pnpm peers check` reports only the existing `@tailwindcss/typography` / `tailwindcss` range quirk.
  - Built SPA under `vite preview` in headless Chromium: `/` renders "Home" and `/does-not-exist` renders the 404 route, with no console errors or warnings.
  - Scaffold E2E, from source: `web-only` 22/22 (emits react-router 8.4.0 and `engines >=22.22`), `full-biome` 75/75.

---

## E19

### E19 · `@repo/observability`: OTLP tracing and `/health` + `/ready`, wired into core-server

- **Status:** done · **Value:** high · **Effort:** M
- **Area:** `packages/@repo/observability` (new), `apps/core-server`, `pnpm-workspace.yaml` (catalog), `.env.example`

**Today** — no template app could be traced, and core-server had no health or readiness endpoint, so an orchestrator could neither probe it nor take a draining replica out of rotation. Requested in chat by Avinash ("observability only" from the useful-packages list), card `tsk_sf4whtwf`.

**Done when** — `@repo/observability` (iTags `node`, `backend`) exports:
- `startTracing({ serviceName })`: a `NodeTracerProvider` exporting over OTLP/HTTP to `<OTEL_EXPORTER_OTLP_ENDPOINT>/v1/traces`, with W3C propagation and undici (`fetch`) client spans. It is off, at zero cost, until the endpoint is set. `OTEL_SERVICE_NAME` overrides the name, sampling follows the standard `OTEL_TRACES_SAMPLER*` variables, and SDK export errors are bridged to `@repo/logger`.
- `startServerSpan`: framework-agnostic, it continues an incoming `traceparent`, is named `METHOD /route/template` (method only when nothing matched) and has no query string in its attributes. Also `withSpan` and `currentTraceId`.
- `createHealth(checks)`: liveness, plus readiness with a per-check timeout (2s default). It is `shutting_down` after `markShuttingDown()`, and the response names a failed check without its error text.

There is no module-patching auto-instrumentation: tsdown bundles express and ioredis, so nothing is left at runtime to patch. core-server requires the package and mounts `GET /health` and `GET /ready` (Redis ping) ahead of every middleware, then `tracingMiddleware`. It records the route when Express assigns `req.route`, because a nested router's `baseUrl` is already restored by `finish` after an error. Its shutdown order is readiness → HTTP drain → Redis → span flush. The Dockerfile has a `HEALTHCHECK` on `/health`. AGENTS.md (§4 table, §6 order and probes), the README and `.env.example` document all of it.

- **Fixed in:** `da18578`. `tracing.test.ts` (8), `health.test.ts` (5), core-server `tracing-middleware.test.ts` (4) and `routes/health/router.test.ts` (4).
  - The nested-router route test failed against the first version (`GET /:id/fail`), which led to the `req.route` capture.
  - Forced gate: 77/77, 0 cached, 285 tests.
  - Built bundle against real Redis and Jaeger:
    - `/health` and `/ready` return 200 with `no-store`, and probes produce no spans.
    - `GET /test` with a `traceparent` arrives in Jaeger under that trace, with `http.route` set and no query string.
    - The 404 and 401 spans are method-only.
    - With Redis stopped, `/ready` returns 503 after 2.05s with no error text, while `/health` stays 200. SIGTERM logs "Shutdown complete".
  - Docker image `apps/core-server/Dockerfile`: the container reports `healthy`, and spans arrive under `OTEL_SERVICE_NAME`.
  - Scaffold E2E, from source:
    - `server-only` 40/40: no packages were selected, and `@repo/observability` arrived through core-server's closure.
    - `full-biome` 79/79.

