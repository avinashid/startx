# Template features

New capabilities for the template apps and packages.
Register: [`features.md`](features.md).

Contents: [F4](#f4) · [F5](#f5) · [F8](#f8) · [F9](#f9) · [F10](#f10) · [F11](#f11)

---

## F4

### F4 · Security middleware baked into `core-server`

- **Status:** open · **Value:** high · **Effort:** S
- **Implements the fix for** [B28](../bugs/security-bugs.md#b28)

**The idea** — Ship `helmet` and `express-rate-limit` wired up by default in the `core-server`
template, so every scaffolded API starts with security headers and throttling.

**Why** — Today a generated API has no `X-Content-Type-Options`, no `X-Frame-Options`, no HSTS, no
CSP, and no rate limit on any route. The unthrottled auth and OTP endpoints are what turn
[B3](../bugs/function-bugs.md#b3) from a theoretical weakness into a practical one.

**What to build**

1. **Dependencies.** Add `helmet` and `express-rate-limit` to `pnpm-workspace.yaml`'s catalog and to
   `apps/core-server/package.json`. They do **not** need `DepCheck` entries — that table governs
   root-level tooling, and these are package-level runtime deps that flow through
   `handlePackageJson` automatically.

2. **Middleware**, ordered correctly (note this also wants [B24](../bugs/security-bugs.md#b24)'s CORS
   reordering):
   ```ts
   app.use(loggerMiddleware);
   app.use(helmet());
   app.use(corsMiddleware);
   app.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: "draft-7" }));
   app.use(cookieParser());
   ```

3. **A stricter limiter for auth routes**, exported for use on login / refresh / OTP:
   ```ts
   export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10 });
   ```

4. **A Redis-backed store when available.** `express-rate-limit` defaults to an in-memory store,
   which silently does nothing useful across replicas. Since `@repo/redis` is already a template
   package, use `rate-limit-redis` when the redis package is part of the workspace. This is where
   the tag model earns its keep — gate it on the `redis` tag rather than a runtime check.

5. **Document the trade-offs.** `helmet()`'s defaults include a restrictive CSP that will break a
   co-served SPA. Ship it with a comment naming the knob rather than a silently weakened default.

**Done when** — A freshly scaffolded API returns security headers and answers `429` under load, and
the limiter is shared across replicas when redis is present.

---

## F5

### F5 · Supported "serve the SPA from the API" mode

- **Status:** open · **Value:** low · **Effort:** M
- **Supersedes the dead code removed in** [B29](../bugs/runtime-bugs.md#b29)

**The idea** — Make single-origin deployment — Express serving both the API and the built
`web-client` — a real, tested option, built from scratch rather than resurrecting old code.

**Why** — `apps/core-server/src/middlewares/serve-static.ts` used to exist, but was commented out at
its only call site and wouldn't have worked if uncommented: it resolved `./frontend` relative to
`__dirname`, which after the tsdown bundle points at `dist/`, and nothing ever put a frontend build
there. [B29](../bugs/runtime-bugs.md#b29) deleted both the file and the commented-out call site
rather than fixing the path, so this feature now starts from nothing.

Meanwhile `web-client` ships an `nginx.conf` and its own Dockerfile, which suggests two-origin
deployment behind nginx is the intended path. So the first decision is still whether this mode is
wanted at all — **if not, this entry can be closed with no further work.** The rest of it assumes
yes.

**What to build**

1. **A configured root**, not a relative guess:
   ```ts
   const root = path.resolve(ENV.STATIC_ROOT ?? "public");
   ```
   Add `STATIC_ROOT` to `@repo/env`. `FILE_STORAGE_PATH` already exists as precedent.
2. **A build step** that copies `web-client`'s `build/client` into the server's static root, wired
   through `turbo.json` so the dependency is explicit.
3. **Correct ordering** — the SPA fallback must come after the API routes and before
   `notFoundMiddleware`, or every unmatched API path returns `index.html` instead of a JSON 404.
4. **Opt-in.** Only mount it when `STATIC_ROOT` is set, so the default stays API-only.
5. **CSP interaction** with [F4](#f4) — `helmet()`'s default CSP will block the SPA's assets. Resolve
   this deliberately and document it.

**Done when** — Setting `STATIC_ROOT` serves the SPA on unmatched non-API routes, API 404s still
return JSON, and the mode is documented in the README.

---

## F8

### F8 · Named pnpm catalogs support

- **Status:** open · **Value:** low · **Effort:** S

**The idea** — Read and write pnpm's **named** catalogs (`catalogs.<name>`), not just the default
`catalog`.

**Why** — `PnpmWorkspace` in `apps/startx-cli/src/types.ts:70` already declares the field:

```ts
export type PnpmWorkspace = {
  packages: string[];
  catalog?: Record<string, string>;
  catalogs?: Record<string, Record<string, string>>;   // declared, never read
};
```

Nothing reads it. `loadTemplateCatalog` (`package.ts:686`) reads only `doc.get("catalog")`, and
`syncDepsWithCatalog` only ever writes there. A user whose workspace organises dependencies into
named catalogs — a normal pnpm pattern for splitting react versions or dev tooling — gets
`startx package add` silently failing to find their existing pins, then duplicating them into the
default catalog.

**What to build**

1. `loadTemplateCatalog` merges `catalogs.*` into its lookup, with the default `catalog` winning on
   conflict.
2. `syncDepsWithCatalog`'s existence check (`doc.hasIn(["catalog", name])`) searches named catalogs
   too, so an entry already pinned under `catalogs.react` isn't duplicated.
3. New entries still go to the default `catalog` — writing into someone's named catalog without
   being told to is too presumptuous. Add `--catalog <name>` for the explicit case.

Do this alongside [B20](../bugs/function-bugs.md#b20); they touch the same two functions and share
the same test setup.

**Done when** — `package add` into a workspace using named catalogs neither duplicates nor misses
existing pins.

---

## F9

### F9 · Worked auth routes wired to the session module

- **Status:** open · **Value:** high · **Effort:** M

**The idea** — Ship real `/auth` routes in `core-server` — register, login, refresh, logout, OTP
verify — actually wired to `@repo/lib`'s session, token, cookie and OTP modules.

**Why** — This is the biggest gap between what the template *contains* and what it *demonstrates*.
`@repo/lib` ships a complete auth kit: `ITokenModule`, `IUserSession` with single/multi-session
strategies and concurrent-session caps, `CookieModule`, `OTPModule`, `HashingModule`. The server
template exposes **one** route — `GET /test` returning `"OK"`.

The consequences are visible throughout this folder:
- `auth-middleware.ts` imports a symbol that doesn't exist ([B4](../bugs/type-bugs.md#b4)) and
  nobody noticed, because nothing calls it.
- `Request.user`'s type has never matched what sessions store ([B5](../bugs/type-bugs.md#b5)).
- `CookieModule.resolveSameSite` has a dead ternary ([B25](../bugs/security-bugs.md#b25)) that a
  single working cross-origin refresh flow would have exposed.

Every one of these is a bug that exists *because* there is no worked example exercising the code.

**What to build**

1. `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` ·
   `POST /auth/otp/send` · `POST /auth/otp/verify`.
2. Wire them through the existing modules — do not write new auth logic. Where a module's API
   doesn't fit the route, that's a finding: file it.
3. Apply `AuthMiddlewares.validateActiveSession` to a protected example route, so the middleware is
   exercised.
4. Use `@repo/lib`'s validation module for request bodies, so the template shows the intended
   pattern.
5. Integration tests against the routes — with the session store mocked or containerised. These
   would become the only meaningful tests in the backend template.

**Sequencing** — Do this **after** B1, B3, B4 and B5. Writing the routes against currently-broken
modules means writing them twice. Expect building this to surface several more defects; that's the
point.

**Done when** — A scaffolded API supports a full login → authenticated request → refresh → logout
cycle out of the box, covered by tests.

---

## F10

### F10 · Next.js app template (`next-app`)

- **Status:** done · **Value:** high · **Effort:** M
- **Area:** `apps/next-app` (new), `apps/startx-cli/src/{types,configs/scripts,configs/files}.ts`, `packages/ui`, root ignore files, `turbo.json`

**Today** — the only frontend template was web-client, a React Router SPA. Requested in chat by Avinash, card `tsk_k43egjtc`.

**Done when** — `apps/next-app` is a Next.js 16 App Router app on `@repo/ui`:
- **Structure:** a client-only `providers.tsx` (`QueryProvider`, `ThemeProvider`), with the layout kept a server component. Public config in `src/config/env.ts` (literal `NEXT_PUBLIC_*` access), plus a home page, a 404 page and `GET /api/health`.
- **Config:** `next.config.ts` sets `output: "standalone"`, `outputFileTracingRoot` and `turbopack.root` to the workspace root, `transpilePackages: ["@repo/ui"]` and `poweredByHeader: false`. The tsconfig is complete enough that `next build` leaves it untouched.
- **Tooling:** ESLint is the shared frontend config plus `@next/eslint-plugin-next` (recommended + core-web-vitals). Vitest resolves the `@/*` alias.
- **Docker:** the Dockerfile ships `.next/standalone` as the `node` user, with a `HEALTHCHECK` on `/api/health`.
- **Agent files:** an app-level AGENTS.md carries the block `next dev` would otherwise write on its own, and CLAUDE.md beside it imports it.
- **CLI:**
  - A `nextjs` tag. Its `dev`/`start` use port 3001, because core-server owns 3000.
  - `build`, `start`, `typecheck` (`next typegen && tsc --noEmit`), `clean` and `deep:clean` entries sit **ahead of** the generic tsdown/node ones, so a workspace with core-server (tsdown global) still gives next-app `next build`.
  - `AGENTS.md`'s FileCheck tags went from `["root"]` to `[]`, so the app-level file ships.
- **Ignore and publish rules:** `.next` and `next-env.d.ts` are ignored by git, Docker and biome, and excluded from the npm tarball. turbo's build outputs include `.next/**` (minus its cache).
- **`@repo/ui` fixes found on the way:** [B89](../bugs/config-bugs.md#b89), [B90](../bugs/function-bugs.md#b90), [B91](../bugs/function-bugs.md#b91).

- **Fixed in:** `bc900f3`. Tests: `apps/next-app/src/app/app.test.tsx` (3), `button.test.tsx` (2), and 2 `file-handler.test.ts` cases pinning the script order.
  - Forced gate: 82/82, 0 cached, 293 tests.
  - `next build` prerenders `/` and `/_not-found`; `/api/health` is dynamic.
  - Under `next start` in headless Chromium, in both the template and the scaffold:
    - `/` returns 200 with the styled button-as-link;
    - `/does-not-exist` returns 404 with the 404 page;
    - the stored theme is applied;
    - the only console error is that document's own 404.
  - Docker image (293MB): the container reports `healthy` as `node`, and the page CSS is served.
  - `next dev` under an agent environment leaves the shipped AGENTS.md and CLAUDE.md byte-identical.
  - `npm pack --dry-run` has the 17 next-app files and no `.next` or `next-env.d.ts`.
  - Scaffold E2E, from source:
    - `next-only` (prettier) 15/15;
    - `full-biome` 84/84, where next-app gets `next build` with tsdown global;
    - `web-only` 22/22.

---

## F11

### F11 · Hono-on-Bun server template (`bun-server`)

- **Status:** done · **Value:** med · **Effort:** M
- **Area:** `apps/bun-server` (new), `apps/startx-cli/src/{types,configs/deps,configs/scripts}.ts`, `apps/{core-server,queue-worker}/package.json`, root `package.json`, `pnpm-workspace.yaml`

**Today** — every backend template was Express on Node. Requested in chat by Avinash, who chose Hono on Bun; card `tsk_r3837m7y`.

**Done when** — `apps/bun-server` is a Hono app on Bun:
- **Shape:** `src/app.ts` builds the app and `src/index.ts` serves it with `Bun.serve`, so tests drive the app with `app.request()` under vitest on Node.
- **Middleware, in order:**
  - `/health` and `/ready` first (`createHealth`), so probes skip everything after them;
  - then `startServerSpan` tracing, named by the matched route template;
  - then request logging through `@repo/logger`, `requestId`, `secureHeaders`, CORS from `CLIENT_URL`/`CORS_URL`, and `bodyLimit` (413).
- **Routes:** an example `POST /echo` with `zValidator` (422 with issues). A JSON 404, and an `onError` that logs an unhandled error and hides its message.
- **Env:** `BUN_SERVER_PORT` (default 3002, so it runs beside core-server) and `BUN_SERVER_MAX_BODY_BYTES` through `defineEnv`.
- **Shutdown:** `onShutdown` from `@repo/lib`, in the order readiness → `server.stop()` (waits for in-flight requests) → span flush. Tracing is the same `@repo/observability` as core-server, and the OTel Node SDK works on Bun.
- **Build:** `bun build --target bun --sourcemap=linked`.
- **Dockerfile:** pnpm builder, then an `oven/bun:1-alpine` runtime holding only the bundle, as user `bun`, with a `HEALTHCHECK`.
- **`bun` is not a host prerequisite.** `bun` is a catalog root devDependency (DepCheck `["bun","root"]`, where `bun` is the app's gTag), and `allowBuilds: { bun: true }` lets its postinstall link the platform binary. The lockfile carries every platform's `@oven/bun-*`, so CI and the musl Docker builder need no setup step.
- **CLI:**
  - bun-server's scripts key on its own `hono` tag. A global `bun` key would have given core-server `bun build`.
  - The scripts sit ahead of the tsdown/node entries.
  - `cross-env`'s DepCheck entry now keys on a new own tag `cross-env` (core-server, queue-worker, bun-server) instead of `express`. Keying it on the global `backend` would have handed it to web-client and cli.

- **Fixed in:** `fca9c02`. `apps/bun-server/src/app.test.ts` (11), plus 4 `file-handler.test.ts` cases (bun scripts with tsdown global; core-server unchanged with bun global; no cross-env for a frontend; root `bun` only with the tag).
  - Forced gate: 87/87, 0 cached, 309 tests.
  - The built bundle under Bun:
    - `/`, `/health`, `/ready` and `/echo` (200/422) answer, and `/nope` returns 404.
    - Jaeger receives `bun-server`'s `GET /` span under the given `traceparent`, with no query string.
    - SIGTERM with an idle keep-alive socket open exits in 0.05s.
    - A Bun script shows `server.stop()` waits for an in-flight request (451ms) and refuses new ones.
  - Docker image (136MB): `healthy` as `bun`, spans arrive under `OTEL_SERVICE_NAME`, and `docker stop` takes 0.18s.
  - Scaffold E2E, from source:
    - `bun-only` 38/38. Its root gets `bun`, and its build passes with no global bun on PATH.
    - `full-biome` 89/89: every app gets its own build/start, and only the three servers get `cross-env`.
    - `server-only` 40/40, with no `bun` in the root.

**Known limit** — [B92](../bugs/function-bugs.md#b92): a workspace scaffolded before this change has no `bun: true` under `allowBuilds`. `startx package add bun-server` there adds the root `bun` dependency, and the next `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`.

