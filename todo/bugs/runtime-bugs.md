# Runtime bugs

Defects that only surface when a generated app is actually running — the code compiles, the tests
(such as they are) pass, and the wrong thing happens in production.
Register: [`bugs.md`](bugs.md).

Contents: [B1](#b1) · [B6](#b6) · [B26](#b26) · [B29](#b29) · [B41](#b41) · [B68](#b68) · [B73](#b73) · [B74](#b74) · [B75](#b75) · [B77](#b77) · [B87](#b87)

---

## B1

### B1 · `errorMiddleware` has arity 3, so Express never calls it as an error handler

- **Status:** verified
- **Severity:** P0
- **Area:** `core-server`
- **File:** `apps/core-server/src/middlewares/error-middleware.ts:11`
- **Fixed in:** `caca799`

> **Resolved.** `_next: NextFunction` added, so `errorMiddleware.length === 4`. Also took the two
> smaller problems noted below: `statusCode` now falls back to `error.statusCode ?? 500` instead of
> discarding it, and the log-level branch is `>= 500` / `< 500` rather than the unreachable `=== 404`.
>
> Verified against a live Express app: `/nope` → `404 application/json`
> `{"success":false,"message":"Route doesn't exist for GET: /nope"}`; a thrown error → `500
> application/json` `{"success":false,"message":"kaboom"}`. Both previously returned Express's HTML
> error page.

**Symptom** — Every 404 and every thrown error returns Express's built-in HTML error page with a
stack trace, instead of the `{ success: false, message }` JSON envelope the template advertises.
In production this leaks stack traces and file paths to clients, and every API consumer gets HTML
where it expects JSON.

**Cause** — Express distinguishes error-handling middleware from ordinary middleware **by function
arity**: it must declare exactly four parameters.

```ts
export const errorMiddleware = (error: Error, _req: Request, res: Response) => {
```

Three parameters, so `app.use(errorMiddleware)` at `routes/server.ts:29` registers it as ordinary
middleware. The chain is therefore:

1. `notFoundMiddleware` (`notfound-middleware.ts:3`) calls `next(new ErrorResponse(..., 404))`.
2. Express looks for the next *error* handler. There is none.
3. Express's default handler responds — HTML, with the stack in non-production.

`errorMiddleware` itself is still reachable as normal middleware, in which case its first parameter
receives the **Request** object, `error.message` is `undefined`, and it answers `500` for anything
that reaches it.

**Fix** — Add the fourth parameter. It must be present even though it is unused:

```ts
import type { NextFunction, Request, Response } from "express";

export const errorMiddleware = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,   // ← required: Express checks fn.length === 4
) => {
```

ESLint's unused-args rule already allows a leading underscore, so no disable comment is needed.

While here, two smaller problems in the same function:
- `error.statusCode = error instanceof ErrorResponse ? error.statusCode : 500` discards a
  `statusCode` set on any other error type. Prefer `error.statusCode ?? 500`.
- The `if (error.statusCode === 404)` branch is unreachable for non-`ErrorResponse` errors, since
  the line above has already forced `500`.

**Verify**
```bash
curl -i http://localhost:3000/definitely-not-a-route
# must return Content-Type: application/json and {"success":false,"message":"Route doesn't exist..."}
```

---

## B6

### B6 · `REDIS_CLUSTER_MODE=false` enables cluster mode

- **Status:** verified
- **Severity:** P0
- **Area:** `@repo/redis`
- **File:** `packages/@repo/redis/src/lib/redis-client.ts:13`
- **Fixed in:** `caca799`

> **Resolved.** Replaced with `z.enum(["true","false","1","0"]).default("false").transform(...)`.
> Verified in all four directions — `false`/`0` → `isCluster=false`, `true`/`1` → `isCluster=true` —
> and an invalid value is now rejected loudly rather than silently coerced:
> `❌ REDIS_CLUSTER_MODE: Invalid option: expected one of "0"|"1"|"true"|"false"`.
>
> The repo-wide `z.coerce.boolean()` sweep and the shared `envBool()` helper remain open as
> [E7](../enhancements/template-enhancements.md#e7).

**Symptom** — Setting `REDIS_CLUSTER_MODE=false` in `.env` — the natural way to express "off" —
turns cluster mode **on**. The app then opens an `ioredis` `Cluster` against a single standalone
node and fails to connect, with an error that points nowhere near the config.

**Cause**
```ts
REDIS_CLUSTER_MODE: z.coerce.boolean().default(false),
```

`z.coerce.boolean()` is `Boolean(value)`. Environment variables are always strings, and the string
`"false"` is truthy. Every value except the empty string coerces to `true`.

This is the standard Zod footgun for env vars; it is only invisible here because the default path
(variable unset) happens to work.

**Fix**
```ts
REDIS_CLUSTER_MODE: z
  .enum(["true", "false"])
  .default("false")
  .transform(v => v === "true"),
```

Or `z.stringbool()` on Zod ≥ 3.24. Then audit the rest of the repo for the same pattern —
`z.coerce.number()` is safe, `z.coerce.boolean()` never is for env input. Adding a shared
`envBool()` helper in `@repo/env` would stop this recurring; see
[E7](../enhancements/template-enhancements.md#e7).

**Verify**
```bash
REDIS_CLUSTER_MODE=false node -e '(async()=>{
  const {getRedis}=await import("@repo/redis");
  console.log(getRedis().constructor.name);   // must be "Redis", not "Cluster"
})()'
```

---

## B26

### B26 · Cookie module throws at import time when `COOKIE_DOMAIN` is unset

- **Status:** verified
- **Severity:** P3
- **Area:** `@repo/lib`
- **File:** `packages/@repo/lib/src/cookie-module/cookie-module.ts:41-49, 78`
- **Fixed in:** `c104915`

> **Resolved — not the way this entry proposed.** Requiring `COOKIE_DOMAIN` inside `defineEnv`
> changes only the error *message*, never the *timing*: `defineEnv` itself runs at module scope,
> so the throw would still fire on import, just with different text. This was checked by applying
> the proposed fix verbatim — it did not move the crash to boot.
>
> What shipped instead: `createRefreshTokenCookie()` is now built behind a lazy getter,
> `getRefreshTokenCookie()`, which memoises the descriptor on first call rather than at module
> load. `CookieModule.validateConfig()` is the explicit opt-in entry point — call it during server
> boot to get the same fail-fast validation on demand, without every importer paying for it.
>
> Related, in the same file: a new `COOKIE_CROSS_SITE` env var (default `false`) now decides
> `sameSite` explicitly instead of the previous hardcoded `"lax"`, and when cross-site is true,
> `sameSite: "none"` forces `secure: true` — browsers reject `SameSite=None` without `Secure`.

**Symptom** — In staging or production with `COOKIE_DOMAIN` unset, the process dies during module
evaluation with `COOKIE_DOMAIN must be configured in staging/production environments`. The stack
points at an `import`, not at startup validation, so it reads like a module resolution failure
rather than a missing config value.

**Cause** — The descriptor is built eagerly at module scope:

```ts
const refreshTokenCookie = createRefreshTokenCookie();   // line 78, runs on import
```

and `resolveCookieDomain` throws inside it. Any module that transitively imports
`@repo/lib/cookie-module` — including tooling, tests and codegen that never touch cookies — inherits
the failure.

**Fix** — Declaring the requirement inside `defineEnv` (the first idea that comes to mind) does
**not** work: `defineEnv` evaluates at module scope too, so the schema throw fires on import same
as today, just with different wording.

Make the descriptor lazy instead — build it on first use, not at module load:

```ts
let refreshTokenCookie: CookieDescriptor | undefined;

function getRefreshTokenCookie(): CookieDescriptor {
  refreshTokenCookie ??= createRefreshTokenCookie();
  return refreshTokenCookie;
}
```

and give callers an explicit, named place to opt into fail-fast validation at boot:

```ts
export const CookieModule = Object.freeze({
  validateConfig(): void {
    getRefreshTokenCookie();
  },
  // ...other methods call getRefreshTokenCookie() instead of the eager constant
});
```

This keeps every non-cookie import (tooling, tests, codegen) crash-free, while giving the server
entrypoint a one-line call — `CookieModule.validateConfig()` — that fails exactly as loudly as the
original eager throw did, at a time the operator expects a config error.

**Verify**
```bash
NODE_ENV=production node -e 'import("@repo/lib/cookie-module")'
# must fail with the env-validation message, or not fail at import at all
```

---

## B29

### B29 · `serve-static.ts` is dead code with a path that wouldn't resolve after bundling

- **Status:** verified
- **Severity:** P3
- **Area:** `core-server`
- **File:** `apps/core-server/src/middlewares/serve-static.ts`, `apps/core-server/src/routes/server.ts:27`
- **Fixed in:** `c104915`

> **Resolved by deletion** — the second option below, not the configurable-path option. Both
> `apps/core-server/src/middlewares/serve-static.ts` and its commented-out call site in
> `apps/core-server/src/routes/server.ts` (`// app.use(serveStatic());`) are gone outright. The
> template is API-only again; the "supported single-origin mode" variant stays tracked as
> [F5](../features/template-features.md#f5) for anyone who wants to build it from scratch.

**Symptom** — The template ships a static-file middleware that is commented out at its only call
site, and would not work if uncommented.

**Cause**
```ts
// apps/core-server/src/routes/server.ts:27
// app.use(serveStatic());
```

and in the middleware itself:
```ts
const distPath      = "./frontend";
const reactDistPath = path.resolve(__dirname, distPath);
```

`__dirname` is derived from `import.meta.url`, which after the tsdown bundle points at
`dist/`, not at the source tree. Nothing in the build copies a frontend bundle to
`dist/frontend`, so the path never exists.

**Fix** — Decide what it is for:
- If serving the built SPA from the API is a supported mode, make the path configurable
  (`ENV.STATIC_ROOT`, defaulting to `path.resolve(process.cwd(), "frontend")`), document it, and
  add the build step that puts `web-client`'s `build/client` there.
- If it is not, delete the file and the commented-out line. The `web-client` template already ships
  an nginx config for this, which suggests nginx is the intended answer.

Track the "supported mode" variant as a feature rather than leaving dead code in the template:
[F5](../features/template-features.md#f5).

**Verify** — Either the route serves `index.html` from a configured root, or the file is gone.

---

## B41

### B41 · Two incompatible boolean env dialects: `@repo/redis` vs `@repo/lib`

- **Status:** verified
- **Severity:** P3
- **Area:** `@repo/redis`, `@repo/lib`
- **File:** `packages/@repo/redis/src/lib/redis-client.ts:14-17`, `packages/@repo/lib/src/cookie-module/cookie-module.ts:37-88`
- **Fixed in:** `5975f4a`

> **Resolved.** Shared `envBool()` added to `packages/@repo/env/src/env-bool.ts`, consumed by both
> `@repo/redis` and `@repo/lib`, converging the two dialects on the strict one:
> ```ts
> export const envBool = (def = false) =>
>   z
>     .enum(["true", "false", "1", "0"])
>     .default(def ? "true" : "false")
>     .transform((v) => v === "true" || v === "1");
> ```
> Deliberately not `z.coerce.boolean()` — that is `Boolean(value)`, so the string `"false"` would
> coerce to `true`, which was the original bug. `""` is also deliberately rejected: an explicitly
> blank env var is a misconfiguration, and silently reading it as `false` is exactly how a
> cluster-mode deployment quietly connects to a single node. `@repo/lib`'s lazy, first-use
> validation in the cookie module is preserved — `envBool()` is only invoked from inside
> `resolveCrossSite()`, not at module scope. `cookie-module.test.ts` was updated so the strict
> spellings resolve, and `TRUE`, `yes`, `on`, `off`, and padded values now assert rejection.

**Symptom** — The same conceptual "boolean env var" is validated with different accepted spellings
and different error types depending on which package's env var it is. This is a design
inconsistency, not a live breakage against today's `.env.example` values.

**Cause** — `@repo/redis` validates `REDIS_CLUSTER_MODE` with a strict, case-sensitive zod enum:
```ts
REDIS_CLUSTER_MODE: z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform(v => v === "true" || v === "1"),
```
Anything outside those four exact literals (`"YES"`, `"on"`, `"True"`) fails zod validation and
throws a `ZodError` at module import.

`@repo/lib`'s cookie module validates `COOKIE_CROSS_SITE` with a hand-rolled, case-insensitive set:
```ts
const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);
...
throw new Error(`COOKIE_CROSS_SITE must be a boolean ("true" or "false"), received "${raw}"`);
```
applied to `raw.trim().toLowerCase()` — lenient, accepts `"YES"`, `"On"`, `"  true  "`, and throws a
plain `Error`, not a `ZodError`, for anything outside both sets.

`todo/bugs/security-bugs.md:266` documents the originally *planned* fix for `COOKIE_CROSS_SITE` as a
strict `z.enum(["true","false"])` matching the redis style; the code that actually shipped diverged
from that plan into the more lenient custom parser above. Each was fixed independently (redis via
B6, the cookie module separately) with no shared boolean-env-parsing helper between them.

**Fix** — Extract a single shared boolean-env helper (e.g. in `@repo/env`) with one accepted
vocabulary and one error type, and have both `@repo/redis` and `@repo/lib` call it instead of
maintaining parallel implementations.

**Verify**
```bash
# same literal accepted/rejected by both packages' boolean env vars, e.g.:
REDIS_CLUSTER_MODE=yes pnpm --filter @repo/redis exec node -e "require('./src/lib/redis-client')"
COOKIE_CROSS_SITE=yes pnpm --filter @repo/lib exec node -e "require('./src/cookie-module/cookie-module')"
# both should behave the same way (both accept, or both reject) once fixed
```

## B63

### B63 · `defineEnv` maps `""` to `undefined`, so `envBool()` reads a blank var as `false` instead of rejecting it

- **Status:** verified
- **Fixed in:** `12eb17e` — forced gate 71/71, exit 0 at `9e67d07` (214 tests)
- **Severity:** P0
- **Area:** @repo/env
- **File:** `packages/@repo/env/src/define-env.ts:50`
- **Found in:** review of `main...c16145f`, 2026-10-01 (startx review agent)

**Symptom** — `REDIS_CLUSTER_MODE=""` resolves to `false`, which is exactly the misconfiguration `envBool` documents it rejects. B6 and B41 were verified only against invalid strings such as `yes`, never against a blank value. Reproduced: `defineEnv({ X: envBool() })` with `X=""` returns `false`, while `envBool().parse("")` throws.

**Cause** — `raw === "" ? normalized.default : raw`. For a bare Zod entry the default is `undefined`, so the schema's own `.default()` fires.

**Fix** — `envBool` registers its schema in a `blankRejecting` WeakSet, and `defineEnv` passes `""` through unchanged for those schemas only. Every other schema keeps the blank-means-unset behaviour that `.env.example`'s empty placeholders (`SMTP_PORT =`, `DATABASE_URL =`, …) rely on — passing blanks through globally would have turned those into `""` instead of their defaults.

**Verify** — unit test in `@repo/env`

---

## B66

### B66 · `uploadMiddleware` may call `next(error)` after it already sent a 413

- **Status:** verified
- **Fixed in:** `c5cfa40` · test `3aa7742` — forced gate 71/71, exit 0 at `9e67d07` (214 tests)
- **Severity:** P3
- **Area:** core-server
- **File:** `apps/core-server/src/middlewares/upload-middleware.ts`
- **Found in:** review of `main...c16145f`, 2026-10-01 (startx review agent) — plausible, not reproduced

**Symptom** — When the byte limit trips, the middleware writes a 413 and destroys the request. The resulting abort error can still reach the completion callback and be forwarded to `errorMiddleware`, which then attempts a second response.

**Cause** — The callback checks `error` before `res.headersSent`.

**Fix** — Check `res.headersSent` first.

**Verify** — upload over the limit → single 413, no `ERR_HTTP_HEADERS_SENT`

---

## B68

### B68 · The built queue-worker crashes on start: `require is not defined in ES module scope` from bundled `@bull-board/ui`

- **Status:** verified
- **Severity:** P0
- **Area:** queue-worker
- **File:** `apps/queue-worker/tsdown.config.ts`
- **Found in:** runtime smoke `tsk_jv5m7m9a`, 2026-10-01
- **Fixed in:** `74decae` — queue-worker's tsdown config keeps `@bull-board/*` external. The built `node dist/index.mjs`, run against Redis 7.2 with `BULL_BOARD_ENABLED=true`, logs `Bull Board listening`; core-server's bundle logs `Server listening`. publish.yml's verify job now runs a "Boot smoke" step (redis:7.2 service) that starts both bundles, so a bundle that can't start fails CI. Its first CI run (on `ef16e87`) failed: since B73, core-server imports `@repo/redis`, which refuses the passwordless service Redis in production. The step now sets `REDIS_ALLOW_NO_AUTH=true` (reproduced and fixed locally against a passwordless redis:7.2: `core-server: ok`, `queue-worker: ok`). E2E matrix 2026-10-01 (7 fresh scaffolds, each installed and gated with `--force`: full-biome 75/75, full-prettier 75/75, server-only 36/36, web-only 22/22, worker-only 40/40, cli-only 33/33, server-bare 18/18) includes worker-only.
- **Reviewed:** `tsk_gnsm8pj5` asked for the externals to be pinned and the smoke to test what the image runs. Done in `9a3c219` (see [B87](#b87)): `dist/package.json` pins the externals, the Dockerfiles install from it, and the smoke boots each dist outside the workspace, waits for `Worker ready` as well as `Bull Board listening`, and requires exit 0 on SIGTERM.

**Symptom** — `node dist/index.mjs` (the app's own `start` script) exits immediately with `ReferenceError: require is not defined in ES module scope`. This happens in the repo's own `apps/queue-worker/dist` and in every scaffold. `tsx src/index.ts` works, and the forced gate is green because nothing ever runs the bundle.

**Cause** — `tsdown.config.ts` sets `noExternal: [/(.*)/]`, which inlines every dependency into one ESM file. `@bull-board/api`'s `createBullBoard` locates its UI with an eval'd `require.resolve('@bull-board/ui/package.json')`. In an `.mjs` bundle `require` doesn't exist, and the bundler can't rewrite an eval'd call.

**Fix** — Keep the `@bull-board/*` packages (and anything else that resolves its own files at runtime) external: `external: ["sharp", /^@bull-board\//]`. Or stop bundling dependencies for this app altogether.

**Verify** — Run `pnpm --filter queue-worker build`, then `node apps/queue-worker/dist/index.mjs` against a Redis. It logs `Worker ready` and `Bull Board listening`. Worth adding a boot smoke step to CI so a bundle that can't start fails the gate.

---

## B73

### B73 · core-server and queue-worker have no SIGTERM/SIGINT handling, so a deploy drops in-flight work

- **Status:** verified
- **Severity:** P2
- **Area:** core-server, queue-worker
- **File:** `apps/core-server/src/index.ts`, `apps/queue-worker/src/index.ts`
- **Found in:** runtime smoke `tsk_jv5m7m9a`, 2026-10-01
- **Fixed in:** `f375732` — new `@repo/lib/shutdown-module` (`createShutdown`/`onShutdown`: runs the steps once and in order, 8s timeout, a second signal exits 1) with unit tests. `closeRedis()` is in `@repo/redis`. core-server closes the HTTP server and then Redis; queue-worker closes workers, the board and Redis. AGENTS.md §4 lists the module.

**Symptom** — On SIGTERM (every container stop or rolling deploy) both processes die at once. core-server cuts in-flight HTTP requests mid-response. queue-worker abandons active BullMQ jobs; they sit `active` until the stalled-job checker requeues them, so they run twice or get flagged stalled.

**Cause** — `grep -rn SIGTERM apps/*/src` matches nothing. There's no `server.close()`, no `worker.close()`, and no Redis `quit()`.

**Fix** — Add a shared `onShutdown` helper (in `@repo/lib` or each app) that stops accepting work, awaits `server.close()` / `worker.close()` / `redis.quit()` with a timeout, then exits 0.

**Verify** — Start the app, open a slow request (or an active job), send SIGTERM: the request completes or the job finishes, the log shows the shutdown, and the exit code is 0.

---

## B74

### B74 · Responses produced before `cors` (429 from the rate limiter) carry no CORS headers, so browsers see a network error rather than a 429

- **Status:** verified
- **Severity:** P2
- **Area:** core-server
- **File:** `apps/core-server/src/routes/server.ts:33-34`
- **Found in:** runtime smoke `tsk_jv5m7m9a`, 2026-10-01
- **Fixed in:** `00488f9` — the limiter stays ahead of `cors` (so rejected origins are throttled too). Its 429 handler adds `Access-Control-Allow-Origin`/`-Credentials`/`Expose-Headers` and `Vary: Origin` for an allowed origin, using the newly exported `isAllowedOrigin`, and it `skip`s `OPTIONS` from allowed origins. Covered by `rate-limit-cors.test.ts`. AGENTS.md §6 documents the rule.

**Symptom** — From a browser on an allowed origin, once the limit is hit, every request fails as an opaque CORS/network error. The SPA can't read the status or `Retry-After`. Preflight `OPTIONS` requests are counted against the same budget and are themselves answered 429 without CORS headers.

**Cause** — The middleware order is `helmet → apiRateLimiter → corsMiddleware`. That order is documented as load-bearing in AGENTS.md §6, so the limiter answers before `cors` ever adds `Access-Control-Allow-Origin`.

**Fix** — Kept `helmet → apiRateLimiter → corsMiddleware`: throttling disallowed origins before cors is deliberate. The limiter's 429 handler sets the CORS headers itself for an allowed origin, and the limiter skips preflights from allowed origins. AGENTS.md §6 says that any middleware ahead of cors that answers requests itself must do the same.

**Verify** — Exhaust the limit with `Origin: <allowed>`: the 429 carries `Access-Control-Allow-Origin`, and an `OPTIONS` preflight still gets 204.

---

## B75

### B75 · Logger prints winston internals (`Symbol(level)`, `Symbol(splat)`) in "Extra Details" and writes ANSI colour codes to non-TTY output

- **Status:** verified
- **Severity:** P3
- **Area:** @repo/logger
- **File:** `packages/@repo/logger/src`
- **Found in:** runtime smoke `tsk_jv5m7m9a`, 2026-10-01
- **Fixed in:** `7de748e` — metadata is built from `Object.entries` (no symbol keys), and `consoleFormat(colors = process.stdout.isTTY)` colours only on a TTY. Covered by `logger.test.ts`. Live: the built cli's output, piped to a file, contains no `\x1b[` and no `Symbol(`.

**Symptom** — `logger.info("Registering worker", { queue })` prints an "Extra Details:" block that includes `Symbol(level): 'info'` and `Symbol(splat): [...]`. Production logs redirected to a file or a collector contain `\x1b[32m` escape codes.

**Cause** — The meta formatter inspects the whole winston `info` object rather than the user's meta, and colourisation is applied unconditionally.

**Fix** — Format only the user-supplied meta (strip symbol keys). Colourise only when `process.stdout.isTTY`, or emit JSON outside development.

**Verify** — `node dist/index.mjs > log` contains no `\x1b[` and no `Symbol(`.

---

## B77

### B77 · web-client throws React hydration error #418 on every unknown route

- **Status:** verified
- **Severity:** P3
- **Area:** web-client
- **File:** `apps/web-client/react-router.config.ts` (`ssr: false`)
- **Found in:** runtime smoke `tsk_jv5m7m9a`, 2026-10-01
- **Fixed in:** `d612404` — a root `HydrateFallback` alone did not stop #418, so there is also a splat `*` route (`routes/not-found.tsx`) whose `clientLoader` throws a 404, registered last in `routes.ts`. Playwright against `vite preview`: `/` and `/does-not-exist` produce no `pageerror`, and the 404 page renders.

**Symptom** — Loading any path that isn't `/` in the production build renders the 404 boundary correctly but logs `Minified React error #418` (hydration text mismatch), and React discards the server HTML.

**Cause** — SPA mode prerenders `index.html` for `/`, and the server returns it for every path. On a deep link the client renders a different tree than the HTML it hydrates.

**Fix** — A root `HydrateFallback` (renders nothing) plus a splat `*` route registered last, whose `clientLoader` throws `data(null, { status: 404 })`. The prerendered shell then carries no route content, and an unknown path hydrates into the 404 boundary instead of mismatching. The fallback alone was not enough.

**Verify** — Playwright: load `/does-not-exist` from `vite preview`; no `pageerror` events.

---

---

## B84

### B84 · `envBool` blank rejection is keyed on the exact schema object, so `.describe()` / `.optional()` loses it

- **Status:** open
- **Severity:** P3
- **Area:** @repo/env
- **File:** `packages/@repo/env/src/env-bool.ts`, `define-env.ts`
- **Found in:** reviewer's review of the B47–B67 fixes (`tsk_jg4zgfvj`), 2026-10-01 (B63 follow-up)

**Symptom / cause** — `blankRejecting` is a WeakSet holding the schema `envBool()` returned. A wrapped schema is a new object, so `defineEnv` treats `""` as unset again.

**Proposed fix** — Mark the behaviour in a way that survives wrapping (zod metadata/brand), or unwrap before the lookup.

---

## B87

### B87 · The queue-worker image cannot start (no `bullmq`), and both images install unpinned externals

- **Status:** verified
- **Severity:** P1
- **Area:** queue-worker, core-server, tsdown-config, CI
- **File:** `apps/*/Dockerfile`, `apps/*/tsdown.config.ts`, `configs/tsdown-config/src/config/tsdown.base.ts`, `.github/workflows/publish.yml`
- **Found in:** reviewer's review of B68 (`tsk_gnsm8pj5`), 2026-10-01. The bullmq crash surfaced once the smoke ran outside the workspace.
- **Fixed in:** `9a3c219`. `runtimeDependencies([...])` in tsdown-config keeps the listed packages external and emits `dist/package.json`, pinning each one the bundle imports to the version pnpm linked for its importer. It errors if one is missing or resolves to two versions. queue-worker lists `sharp`, `bullmq` and `@bull-board/{api,express}`; core-server lists `sharp`. The Dockerfiles `npm install --omit=dev` from that manifest. The CI boot smoke runs on Node 24, copies each dist to a temp dir and installs only its manifest. It waits for every ready line (`Worker ready` and `Bull Board listening` for the worker), then sends SIGTERM and requires exit 0; the redis service has a health check.
  - **Local replay (passwordless redis:7.2):** `core-server: ok` and `queue-worker: ok`. Negatives all exit 1: manifest without bullmq (`ERR_MODULE_NOT_FOUND`), bull-board inlined (`require is not defined`, i.e. B68), and a process exiting 1 on SIGTERM (`did not exit 0`).
  - **Images:** `docker build` of both images succeeds. queue-worker logs `Worker ready` and `Bull Board listening` and has bullmq 5.76.4 and @bull-board/ui 7.1.5. core-server logs `Server listening`. Both report container exit 0 on `docker stop`.
  - **Gates:** forced gate 73/73, 0 cached, exit 0, 252 tests. Fresh scaffolds worker-only 40/40 and server-only 36/36. Each scaffold's own dist boots in the same isolated smoke; its manifest pins that scaffold's lockfile (@bull-board 7.2.1, bullmq 5.81.5).

**Symptom** — The B68 fix kept `@bull-board/*` external and the Dockerfile installed `sharp @bull-board/api @bull-board/ui @bull-board/express` with a bare `npm install`. The image then crashes on start with `Cannot find module 'bullmq'` from `@bull-board/api/dist/queueAdapters/bullMQ.js`. Even without that, every image build takes whatever versions npm resolves that day, not the ones the dist was built and tested against. CI stayed green because its smoke ran `dist/index.mjs` inside the workspace, where pnpm's node_modules satisfies every external. It also only waited for `Bull Board listening`, which doesn't need Redis, and never checked the exit code.

**Cause** — `@bull-board/api`'s BullMQ adapter `require`s `bullmq` without declaring it, so only a host that provides bullmq works. The externals list existed twice, once in tsdown.config and once in the Dockerfile, with no versions in the second.

**Fix** — Above. sharp is no longer installed for nothing: neither bundle imports it today, so it is pinned only once an app imports `@repo/lib/storage-module` (a probe build pins `sharp 0.35.3`).
