# Runtime bugs

Defects that only surface when a generated app is actually running — the code compiles, the tests
(such as they are) pass, and the wrong thing happens in production.
Register: [`bugs.md`](bugs.md).

Contents: [B1](#b1) · [B6](#b6) · [B26](#b26) · [B29](#b29)

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

**Fix** — Either declare the requirement where every other env requirement lives, so it surfaces as
a normal validation error:

```ts
const credentials = defineEnv({
  COOKIE_DOMAIN: ENV.NODE_ENV === "development"
    ? z.string().optional()
    : z.string().min(1, "COOKIE_DOMAIN is required in staging/production"),
});
```

or make the descriptor lazy (build it on first use inside the `CookieModule` methods). The first
option is better: it fails fast at boot, alongside every other env error, with a message the
operator can act on.

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
