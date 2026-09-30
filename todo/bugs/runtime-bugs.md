# Runtime bugs

Defects that only surface when a generated app is actually running — the code compiles, the tests
(such as they are) pass, and the wrong thing happens in production.
Register: [`bugs.md`](bugs.md).

Contents: [B1](#b1) · [B6](#b6) · [B26](#b26) · [B29](#b29) · [B41](#b41)

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
