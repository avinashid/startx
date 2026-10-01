# Security bugs

Defects with a security impact in the **generated** backend. These are template defaults, so every
scaffolded project inherits them.
Register: [`bugs.md`](bugs.md).

Contents: [B22](#b22) · [B23](#b23) · [B24](#b24) · [B25](#b25) · [B28](#b28)

**Cross-references** — filed elsewhere, but security-relevant:
- [B3](function-bugs.md#b3) — OTP valid for 3.5 days over a 9 000-code space with no attempt limit. **The most serious item in this folder.**
- [B1](runtime-bugs.md#b1) — stack traces leak to clients because the error handler never runs.
- [B27](function-bugs.md#b27) — unvalidated `limit` allows an unbounded query.
- [B2](function-bugs.md#b2) — `NODE_ENV` is deleted, so libraries take their development path in production.

---

## B22

### B22 · `/files` serves the whole `storage/` directory with no authentication

- **Status:** verified
- **Severity:** P3
- **Area:** `core-server`
- **File:** `apps/core-server/src/routes/files/router.ts:6`
- **Fixed in:** `c104915`

> **Resolved, choosing the private-by-default branch.** `createFilesRouter()` now runs
> `AuthMiddlewares.validateActiveSession` followed by a new `enforceOwnership` guard, against an
> ownership layout of `STORAGE_ROOT/<userId>/…` rather than a flat shared directory. The root itself
> comes from `path.resolve(ENV.FILE_STORAGE_PATH)` (`STORAGE_ROOT`, new
> `apps/core-server/src/config/server-config.ts`) instead of the relative `"storage"` literal, so it
> no longer moves with `process.cwd()`.
>
> `enforceOwnership` decodes `req.path` and rejects it if it contains a `..` segment or its first
> segment isn't `req.user.id` — decoding **before** that check, because `express.static` normalizes
> the path only after it resolves, so a raw prefix check alone would let
> `/<own-id>/../<other-id>/x` through. `dotfiles: "deny"` and `index: false` were added as proposed.
>
> One thing the entry's Fix didn't ask for: `setHeaders` now forces
> `Content-Disposition: attachment` on every response. Uploads are untrusted bytes served from the
> API's own origin, so without it an uploaded `.html` would render in place and inherit `'self'` in
> any CSP the origin sets.

**Symptom** — Every file written to `storage/` is readable by anyone who knows or guesses its URL.
There is no auth check, no ownership check, and no signed-URL mechanism.

**Cause**
```ts
export function createFilesRouter(): Router {
  const router = Router();
  router.get("/*splat", expressStatic("storage"));
  return router;
}
```

mounted at `app.use("/files", createFilesRouter())` (`routes/server.ts:20`) — before any auth
middleware, and `AuthMiddlewares.validateActiveSession` is not applied to it.

Two aggravating details:
- `expressStatic("storage")` is a **relative** path, resolved against `process.cwd()`. Where files
  land therefore depends on where the process was started, which differs between `pnpm dev` (package
  dir) and a Docker container (`/app`).
- The `@repo/lib` storage module writes user uploads here, so this is the upload sink, not a
  public-assets directory.

**Fix** — Decide the model explicitly and implement it:
- *Private by default* (recommended for an upload sink): put `AuthMiddlewares.validateActiveSession`
  in front of the router and add an ownership check before streaming.
- *Public assets*: keep it open, but move it to a clearly named `public/` directory that is separate
  from the upload sink, and document that anything written there is world-readable.

Either way, resolve the root from config rather than `cwd`:
```ts
expressStatic(path.resolve(ENV.FILE_STORAGE_PATH))
```
`FILE_STORAGE_PATH` already exists in `packages/@repo/env/src/default-env.ts:11` and is unused here.

Also set `dotfiles: "deny"` and `index: false` on the static handler.

**Verify**
```bash
curl -i http://localhost:3000/files/<known-upload>    # must be 401 without a session
```

---

## B23

### B23 · `fileUpload()` has no size limits — unbounded in-memory uploads on every route

- **Status:** verified
- **Severity:** P3
- **Area:** `core-server`
- **File:** `apps/core-server/src/routes/server.ts:17`
- **Fixed in:** `c104915`

> **Resolved, and the entry's proposed options list undersold what was missing.** The literal
> suggestion — pass `limits: { fileSize }` plus `abortOnLimit`/`useTempFiles` to `fileUpload()` —
> would still have left busboy's own defaults in place for everything **except** file size: `fields`
> and `parts` default to `Infinity`, and `fieldSize`/`fieldNameSize` default low but unbounded in
> count. The new `apps/core-server/src/middlewares/upload-middleware.ts` sets all of them —
> `fieldSize`, `fieldNameSize`, `headerPairs`, `files`, `fields`, `parts` — the last three capped at
> `ServerConfig.MAX_UPLOAD_FILES`/`MAX_UPLOAD_FIELDS` **+ 1**, so an overflow is detected and answered
> with a real 413 instead of busboy silently discarding the extra parts.
>
> It also does more than the entry asked for: a `content-length` over `MAX_MULTIPART_SIZE_MB` is
> rejected before any parsing starts, a running byte count catches the chunked-transfer case that has
> no declared length, and each request gets its own randomly-named temp dir (`UPLOAD_TEMP_ROOT/<uuid>`)
> that is `rm -rf`'d on `res.close` regardless of how the request ended — a fixed shared
> `tempFileDir` was not used. It stays mounted globally in `server.ts` rather than scoped to a
> specific upload route as the Fix suggested; it self-guards by short-circuiting non-multipart
> requests (`isMultipart`) instead.

**Symptom** — A single unauthenticated `POST` with a large body buffers the whole thing into the
Node process's memory. A handful of concurrent requests exhausts the heap and takes the server down.

**Cause**
```ts
app.use(fileUpload());
```

Defaults with no options: no `limits`, no `abortOnLimit`, no `useTempFiles`. `express-fileupload`
buffers to memory unless told otherwise. It is also applied **globally**, so every route pays the
multipart-parsing cost, not just the ones that accept uploads.

The adjacent body parsers have the same gap: `json()` and `urlencoded()` are called with no `limit`,
so they use the 100 kb default — fine — but that default does not extend to the file upload path.

**Fix**
```ts
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 },   // pick a real number, make it configurable
  abortOnLimit: true,
  useTempFiles: true,
  tempFileDir: path.resolve(ENV.FILE_STORAGE_PATH, ".tmp"),
  safeFileNames: true,
  preserveExtension: true,
}));
```

Then scope it to the routes that need it — `app.use("/upload", fileUpload({...}), uploadRouter)` —
rather than globally. Expose the size cap as an env var so deployments can tune it.

**Verify**
```bash
head -c 200M /dev/zero > /tmp/big.bin
curl -F file=@/tmp/big.bin http://localhost:3000/upload   # must 413, not OOM the process
```

---

## B24

### B24 · CORS is registered after the body parsers

- **Status:** verified
- **Severity:** P3
- **Area:** `core-server`
- **File:** `apps/core-server/src/routes/server.ts:13-18`
- **Fixed in:** `c104915`

> **Resolved, but not with the order this entry proposed.** The Fix section said "move
> `corsMiddleware` directly after `loggerMiddleware`, ahead of every parser." The shipped order in
> `apps/core-server/src/routes/server.ts` is instead: `loggerMiddleware` → `helmet()` →
> `apiRateLimiter` → `corsMiddleware` → `cookieParser` → `urlencoded`/`json` → `uploadMiddleware`.
>
> The rate limiter — new in this same commit, see [B28](#b28) — sits **before** `corsMiddleware`,
> not after it as a literal reading of "ahead of every parser" would put a security header/limiter
> pair. That's deliberate: a disallowed `Origin` is rejected via `next(error)`, which jumps straight
> to the error middleware, skipping everything downstream — including a limiter placed after `cors`.
> Measured before fixing the order: 150 requests with a bad `Origin` produced 150×403 and **zero**
> 429s, i.e. the limiter never engaged for exactly the traffic an attacker controls. With the limiter
> ahead of `cors`, an unauthorized-origin flood is throttled the same as any other request, and
> `cors` still runs ahead of every body parser as the entry originally asked.

**Symptom** — A cross-origin request from a disallowed origin has its body fully parsed — including
multipart file uploads buffered into memory — before the origin is ever checked.

**Cause** — Middleware order:
```ts
app.use(loggerMiddleware);
app.use(cookieParser());
app.use(urlencoded({ extended: true }));
app.use(json());
app.use(fileUpload());
app.use(corsMiddleware);        // ← last
```

Combined with [B23](#b23), this means an attacker on any origin can force unbounded memory
allocation before the CORS layer has a say.

**Fix** — Move `corsMiddleware` directly after `loggerMiddleware`, ahead of every parser:
```ts
app.use(loggerMiddleware);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(urlencoded({ extended: true }));
app.use(json());
```

Note this is defence in depth, not a complete fix — CORS is enforced by browsers and does not stop a
direct client. The real protection against the memory issue is the size limit in B23.

While here: `corsMiddleware` uses `origin: [ENV.CLIENT_URL, ENV.CORS_URL]` with
`credentials: true`, and both default to localhost URLs (`default-env.ts:8-10`). A deployment that
forgets to set them gets a silently misconfigured allowlist rather than an error. Consider requiring
them when `NODE_ENV !== "development"`.

**Verify** — Send a disallowed-origin request with a large body and confirm it is rejected before
the body is consumed.

---

## B25

### B25 · `resolveSameSite` returns `"lax"` in both branches

- **Status:** verified
- **Severity:** P3
- **Area:** `@repo/lib`
- **File:** `packages/@repo/lib/src/cookie-module/cookie-module.ts:52-60`
- **Fixed in:** `c104915`

> **Resolved along the lines proposed, with a couple of changes.** `resolveSameSite` now takes a
> `crossSite` boolean and returns `"none"` when true, `"lax"` otherwise; a new `COOKIE_CROSS_SITE`
> env var drives it. Unlike the entry's suggested `z.enum(["true","false"])`, the shipped schema is
> `z.string().optional()` with a manual `TRUTHY`/`FALSY` set-membership check (`"1"/"true"/"yes"/"on"`
> vs `"0"/"false"/"no"/"off"`) that throws on anything else. `secure` is now derived as
> `sameSite === "none" || env !== "development"` — the pairing the entry asked to "assert explicitly"
> is now structural rather than two independent expressions that could drift apart.
>
> One change outside the entry's scope: building the cookie descriptor moved from eager,
> module-load-time (`const refreshTokenCookie = createRefreshTokenCookie()`) to a lazy
> `getRefreshTokenCookie()`, memoized on first call and exposed via a new `CookieModule.validateConfig()`
> for startup to call explicitly. Previously, any import of this module in an environment missing
> `COOKIE_DOMAIN` — including unrelated tooling — crashed at import time; now that only happens when
> a cookie is actually built, or when `validateConfig()` is called deliberately during boot.

**Symptom** — The refresh-token cookie is always `SameSite=Lax`. In the deployment the file's own
comment describes — frontend and API on different origins — the browser will not send the cookie on
cross-site requests, so refresh silently fails in production while working locally.

**Cause** — A ternary whose branches are identical, directly contradicting the comment above it:

```ts
function resolveSameSite(env: RuntimeEnv): CookieOptions["sameSite"] {
  /**
   * If frontend and API are on different origins:
   * use "none" + secure=true
   *
   * Otherwise lax is safer.
   */
  return env === "production" || env === "staging" ? "lax" : "lax";
}
```

Someone intended `"none"` for the cross-origin case and either never finished or reverted it without
removing the ternary.

**Fix** — Make it a real decision driven by configuration, since only the deployer knows whether the
origins differ:

```ts
const credentials = defineEnv({
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_CROSS_SITE: z.enum(["true","false"]).default("false").transform(v => v === "true"),
});

function resolveSameSite(env: RuntimeEnv): CookieOptions["sameSite"] {
  if (env === "development") return "lax";
  return credentials.COOKIE_CROSS_SITE ? "none" : "lax";
}
```

`secure` is already `env !== "development"`, which satisfies the `SameSite=None` requirement. Assert
that pairing explicitly — `SameSite=None` without `Secure` is rejected by every current browser.

**Verify**
```bash
COOKIE_CROSS_SITE=true NODE_ENV=production node -e '...'
# Set-Cookie must contain "SameSite=None; Secure"
```

---

## B28

### B28 · No helmet, no rate limiting, no request-size caps in the server template

- **Status:** verified
- **Severity:** P3
- **Area:** `core-server`
- **File:** `apps/core-server/src/routes/server.ts`
- **Fixed in:** `c104915`

> **Resolved directly, not deferred as the entry proposed.** The Fix section tracked this as a
> separate feature ([F4](../features/template-features.md#f4)) and said the entry "stays open as the
> record of the gap." Instead `helmet()` and a new
> `apps/core-server/src/middlewares/rate-limit-middleware.ts` (`apiRateLimiter`, `authRateLimiter`)
> landed in this same commit, wired into `server.ts`, with the window/limit values pulled from new
> `ServerConfig` env vars (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`,
> `AUTH_RATE_LIMIT_MAX`) rather than hardcoded. `authRateLimiter` is mounted on `/auth` ahead of the
> router itself, with `skipSuccessfulRequests: true` — not in the original Fix sketch.
>
> What the entry flagged as a caveat is still true: the store is `express-rate-limit`'s in-memory
> default, so a multi-replica deployment does not share counters. `rate-limit-redis` on top of
> `@repo/redis` was not added. See [B24](#b24) for why the limiter had to be placed **before**
> `corsMiddleware` rather than after it.

**Symptom** — A project scaffolded from this template ships with no security headers
(`X-Content-Type-Options`, `X-Frame-Options`, HSTS, CSP), no rate limiting on any route, and no
per-route body-size caps. The login and OTP endpoints are unthrottled, which is what makes
[B3](function-bugs.md#b3) practically exploitable rather than merely theoretical.

**Cause** — Not a coding error; a missing default. The template's middleware stack is logger,
cookies, parsers, upload, CORS, routes, 404, error. Nothing else.

**Fix** — Add to the `core-server` template, with catalog entries in `pnpm-workspace.yaml` and the
matching `DepCheck` entries so the generator wires them up:

```ts
import helmet from "helmet";
import rateLimit from "express-rate-limit";

app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: "draft-7" }));
```

and a tighter limiter on the auth and OTP routes specifically:
```ts
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10 });
```

`express-rate-limit` uses an in-memory store by default, which does not work across replicas.
Since `@repo/redis` is already a template package, ship `rate-limit-redis` as the store when the
`redis` package is selected.

Because this adds dependencies and a config surface rather than correcting existing code, the
implementation is tracked as a feature: [F4](../features/template-features.md#f4). This entry stays
open as the record of the gap.

**Verify**
```bash
curl -I http://localhost:3000/test | grep -i x-content-type-options
for i in $(seq 1 200); do curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/test; done | grep -c 429
```

## B53

### B53 · Placeholder JWT / encryption secrets from `.env.example` pass validation outside development

- **Status:** open
- **Severity:** P0
- **Area:** @repo/lib
- **File:** `packages/@repo/lib/src/token-module/index.ts`, `encryption-module/index.ts`, `.env.example`
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — If `.env.example` is copied to `.env` and deployed, the server boots with `ACCESS_TOKEN_SECRET=CHANGE_ME_000…a`, which is public, so anyone can forge tokens. The all-zero `INTEGRATION_ENCRYPTION_KEY` is accepted the same way.

**Cause** — The only checks are `min(32)` and `length(64)`. The placeholders were made long enough to pass them (that was B7) but are never rejected.

**Fix** — Add an `envSecret()` helper in `@repo/env` that rejects `CHANGE_ME` values and single-character repeats when `NODE_ENV` is not `development` or `test`. The token and encryption modules use it, and the access and refresh secrets must differ.

**Verify** — unit tests in `@repo/env`; `NODE_ENV=production` with placeholders throws at import

---

## B54

### B54 · `verifyMailOTP` read-modify-writes the attempt counter, so parallel guesses bypass the 5-attempt cap

- **Status:** open
- **Severity:** P0
- **Area:** @repo/lib
- **File:** `packages/@repo/lib/src/otp-module/index.ts`
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — N concurrent wrong guesses all read `attempts=0` and all write `attempts=1`, so an attacker gets about N×5 guesses per code instead of 5. B3 is recorded as fixed, but its cap only holds for serial requests.

**Cause** — `get` → `compare` → `set({...rows, attempts+1})` with no atomicity.

**Fix** — Count attempts with an atomic Redis `INCR` on a sibling key, with the same TTL, **before** comparing. Once the count reaches max, the code and the counter are deleted. A guess that arrives past the cap is rejected without being compared.

**Verify** — unit test with a fake store: 20 parallel wrong guesses → at most 5 compares, and the code is destroyed

---

## B55

### B55 · `uploadMiddleware` is mounted globally before any auth, so anonymous clients can push multipart bodies to every route

- **Status:** open
- **Severity:** P3
- **Area:** core-server
- **File:** `apps/core-server/src/routes/server.ts:37`
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — Any unauthenticated request to any path, including 404s, gets its multipart body parsed and buffered up to the upload limits.

**Cause** — The parser is `app.use`d globally, ahead of the routers and their auth guards.

**Fix** — *(design decision — see the card)*

**Verify** — unauthenticated multipart POST to an unknown route is rejected without the body being parsed

---

## B56

### B56 · `errorMiddleware` returns raw `error.message` for 5xx responses

- **Status:** open
- **Severity:** P3
- **Area:** core-server
- **File:** `apps/core-server/src/middlewares/error-middleware.ts`
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — An unhandled `Error("connect ECONNREFUSED 10.0.3.7:5432")` reaches the client verbatim as `message`.

**Cause** — `message` is taken from any error, regardless of status.

**Fix** — For 5xx responses that aren't an `ErrorResponse`, return "Internal Server Error" outside development, and keep logging the real error.

**Verify** — unit test: thrown plain Error → 500 with generic message in production

---

## B57

### B57 · `TRUST_PROXY=loopback` default collapses all clients into one rate-limit bucket behind a remote proxy

- **Status:** open
- **Severity:** P3
- **Area:** core-server
- **File:** `apps/core-server/src/config/server-config.ts`, `.env.example`
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — Behind an ALB or a separate nginx container, `req.ip` is the proxy's address, so every client shares one limiter key.

**Cause** — The default is safe (it can't be spoofed), but it's only explained in a code comment; the env file a deployer actually reads doesn't mention it.

**Fix** — Keep the safe default (`.env.example` already spells out the remote-proxy case). Add `untrustedProxyWarning`, mounted ahead of the limiter: it logs once when a request carries an `X-Forwarded-For` that `trust proxy` did not honour, which is the only visible symptom of the shared bucket. AGENTS.md §6 documents it.

**Verify** — `.env.example` documents TRUST_PROXY

---

## B58

### B58 · `jwt.verify` does not pin `algorithms`

- **Status:** open
- **Severity:** P3
- **Area:** @repo/lib
- **File:** `packages/@repo/lib/src/token-module/i-token.ts`
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — Verification accepts any HMAC algorithm the library supports, rather than only the one tokens are signed with.

**Cause** — `jwt.verify(token, key)` is called without `{ algorithms }`.

**Fix** — Verify with `algorithms: [options.algorithm ?? "HS256"]`.

**Verify** — unit test: HS512-signed token with the same key is rejected

---

## B59

### B59 · Redis connects without auth in production when `REDIS_PASSWORD` is unset

- **Status:** open
- **Severity:** P3
- **Area:** @repo/redis
- **File:** `packages/@repo/redis/src/lib/redis-client.ts`
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — If a production deploy forgets `REDIS_PASSWORD`, it silently connects to Redis unauthenticated.

**Cause** — `REDIS_USERNAME` and `REDIS_PASSWORD` default to `""` so that local dev works, and nothing distinguishes production.

**Fix** — *(design decision — see the card)*

**Verify** — —

---
