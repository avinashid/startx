# Type bugs

TypeScript compile errors. Every entry here is reproducible with `pnpm exec turbo typecheck --continue`.
Register: [`bugs.md`](bugs.md).

Contents: [B4](#b4) · [B5](#b5) · [B12.1](#b121) · [B12.2](#b122) · [B12.3](#b123) · [B12.4](#b124)

**Current state: 41 of 41 typecheck tasks pass.** Every entry in this file is closed. Keep it
that way — `turbo typecheck` is now a meaningful gate rather than a known-red command.

---

## B4

### B4 · `auth-middleware` imports `TokenModule` from a module that doesn't export it

- **Status:** verified
- **Severity:** P0
- **Area:** `core-server`
- **File:** `apps/core-server/src/middlewares/auth-middleware.ts:1`
- **Fixed in:** `caca799`

> **Resolved.** Now `import { AccessToken, type AccessTokenPayload } from "@repo/lib/token-module"`,
> calling `AccessToken.verifyToken(...)` — the real symbol, on the real module, with the real method
> name.
>
> Fixing the import exposed a second defect worth recording: `ITokenModule.verifyToken` wraps
> `jwt.verify`, which **throws** on an expired or tampered token. Called bare, that would have
> propagated to the error handler as a **500**. The call is now wrapped so an unverifiable token
> yields the intended **401**.

**Symptom**
```
src/middlewares/auth-middleware.ts(1,10): error TS2305:
  Module '"@repo/lib/extra"' has no exported member 'TokenModule'.
```
The generated backend does not compile at all. Anyone who scaffolds `core-server` hits this on
their first `pnpm typecheck`.

**Cause**
```ts
import { TokenModule } from "@repo/lib/extra";
```

`@repo/lib`'s subpath export map is `"./*": "./src/*/index.ts"`, so `@repo/lib/extra` resolves to
`packages/@repo/lib/src/extra/index.ts`, whose entire contents are:

```ts
export * from "./pagination-module.js";
```

There is no `TokenModule` anywhere in the repo. Token helpers live in
`packages/@repo/lib/src/token-module/index.ts` and are exported as two **instances**:

```ts
export const AccessToken  = new ITokenModule<AccessTokenPayload>({ ... });
export const RefreshToken = new ITokenModule<RefreshTokenPayload>({ ... });
```

So both the module path and the symbol name are wrong, and the method call on line 34
(`TokenModule.verifyAccessToken(accessToken)`) does not match `ITokenModule`'s surface either.

**Fix** — Import the real instance and call its real verify method:

```ts
import { AccessToken } from "@repo/lib/token-module";
...
const payload = AccessToken.verify(accessToken);
```

Confirm the method name against `packages/@repo/lib/src/token-module/i-token.ts` before committing —
the middleware was clearly written against an older API.

**Verify**
```bash
pnpm --filter core-server typecheck
```

---

## B5

### B5 · `Request.user` type contradicts what sessions actually store

- **Status:** verified
- **Severity:** P0
- **Area:** `core-server`
- **File:** `apps/core-server/src/config/custom-type.ts:6`
- **Fixed in:** `caca799`

> **Resolved** as described: `RequestUser = Omit<SessionUser, "accessToken">` now lives in
> `packages/common/src/types/users.ts` and is referenced by `custom-type.ts` (both `Express.Request`
> and `IncomingMessage`) and by `i-session.ts` (`SessionRecord.user` and `startSession`). The
> `Omit<>` is written once instead of three times.
>
> `pnpm --filter core-server typecheck` passes. Making `req.user` optional was **not** done — it is a
> wider change that touches every handler; worth a follow-up.

**Symptom**
```
src/middlewares/auth-middleware.ts(72,4):  error TS2741:
  Property 'accessToken' is missing in type 'Omit<SessionUser, "accessToken">'
  but required in type 'SessionUser'.
src/middlewares/auth-middleware.ts(103,5): error TS2741: (same)
```

**Cause** — The global augmentation promises more than the session layer stores:

```ts
// apps/core-server/src/config/custom-type.ts:6
declare global {
  namespace Express {
    export interface Request { user: SessionUser; }
  }
}
```

but the session record deliberately omits the token:

```ts
// packages/@repo/lib/src/session-module/i-session.ts:27
export type SessionRecord = {
  sessionId: string;
  user: Omit<SessionUser, "accessToken">;
  ...
};
```

`authenticateRequest` returns `session.user`, so `req.user = auth.user` cannot satisfy the declared
type. The omission is correct — an access token has no business being persisted in a session record.
The declaration is what's wrong.

**Fix** — Name the narrowed shape once and use it in both places:

```ts
// packages/common/src/types/users.ts
export type RequestUser = Omit<SessionUser, "accessToken">;
```
```ts
// apps/core-server/src/config/custom-type.ts
import type { RequestUser } from "@repo/common/types/users";
declare global {
  namespace Express {
    export interface Request { user: RequestUser; }
  }
}
```
Update `IncomingMessage` in the same file, and `SessionRecord.user` to reference `RequestUser`.

Also consider `user?: RequestUser` — `req.user` is only populated after the auth middleware runs, and
the non-optional declaration currently lets unauthenticated handlers dereference it without a
compile error.

**Verify**
```bash
pnpm --filter core-server typecheck
```

---

## B12.1

### B12.1 · `UnwrapColumns` indexes an unconstrained generic

- **Status:** verified
- **Severity:** P1
- **Area:** `@db/drizzle`
- **File:** `packages/@db/drizzle/src/functions.ts:113-115`
- **Fixed in:** `1c91e1d`

> **Resolved, by deleting the hand-rolled type rather than constraining it.** The suggestion below —
> constrain the `infer` to `ColumnBaseConfig<...>` — does not work here: in the installed Drizzle
> version `ColumnBaseConfig` takes **one** type argument, and threading `C` back through `PgColumn`
> then fails `TS2344`.
>
> Drizzle already exports `GetColumnData<TColumn>`, which *is* the
> `notNull extends true ? data : data | null` mapping `UnwrapColumns` was reimplementing:
>
> ```ts
> [K in keyof T]: T[K] extends AnyColumn
>   ? GetColumnData<T[K]>
>   : T[K] extends SQL<infer S> ? S : never;
> ```
>
> `AnyColumn` was already imported. Fewer lines, no generic gymnastics, and it tracks upstream if
> Drizzle changes its column internals.

**Symptom**
```
src/functions.ts(113,11): error TS2536: Type '"notNull"' cannot be used to index type 'C'.
src/functions.ts(114,13): error TS2536: Type '"data"'    cannot be used to index type 'C'.
src/functions.ts(115,13): error TS2536: Type '"data"'    cannot be used to index type 'C'.
```

**Cause** — `C` is introduced by `infer` from `PgColumn<infer C>` and is therefore unconstrained, so
TypeScript will not let it be indexed:

```ts
[K in keyof T]: T[K] extends PgColumn<infer C>
  ? C["notNull"] extends true ? C["data"] : C["data"] | null
  : ...
```

**Fix** — Constrain the inferred parameter to the shape being indexed. Drizzle exports
`ColumnBaseConfig`; the minimal version is an inline constraint:

```ts
T[K] extends PgColumn<infer C extends { data: unknown; notNull: boolean }>
  ? C["notNull"] extends true ? C["data"] : C["data"] | null
  : ...
```

Check the installed Drizzle version's actual column-config type before settling on the constraint —
using their exported type is preferable to a structural approximation.

**Verify**
```bash
pnpm --filter @db/drizzle typecheck
```

---

## B12.2

### B12.2 · `ZodTypeAny` / `QueryKey` need `import type` under `verbatimModuleSyntax`

- **Status:** verified
- **Severity:** P1
- **Area:** `ui`
- **File:** `packages/ui/src/api/use-api/` (4 sites)
- **Fixed in:** `1c91e1d`

> **Resolved.** All four switched to inline type specifiers — `import { z, type ZodTypeAny }` and
> `import { type QueryKey, ... }` — which keeps the value imports in the same statement.
>
> Adding `@typescript-eslint/consistent-type-imports` to prevent recurrence was **not** done; it is
> part of [E2](../enhancements/template-enhancements.md#e2).

**Symptom**
```
api-builder.ts(2,13):  error TS1485: 'ZodTypeAny' resolves to a type-only declaration and must be
                       imported using a type-only import when 'verbatimModuleSyntax' is enabled.
api-helpers.ts(1,10):  error TS1485: (same)
api-types.ts(2,13):    error TS1485: (same)
query-factory.ts(3,10):error TS1484: 'QueryKey' is a type and must be imported using a type-only
                       import when 'verbatimModuleSyntax' is enabled.
```

These surface through `web-client`'s typecheck as well, since it pulls `ui` into its type graph.

**Cause** — `verbatimModuleSyntax` is on in the shared tsconfig, which requires every type-only
binding to be imported with `import type`. Four imports still use value syntax.

**Fix** — Mechanical:
```ts
import type { ZodTypeAny } from "zod";
import type { QueryKey }   from "@tanstack/react-query";
```
Or, where the import is mixed, mark the individual specifier: `import { z, type ZodTypeAny } from "zod"`.

`@typescript-eslint/consistent-type-imports` with `fixStyle: "inline-type-imports"` would catch and
auto-fix this class permanently — worth adding to `eslint-config`'s base rules.

**Verify**
```bash
pnpm --filter @repo/ui typecheck && pnpm --filter web-client typecheck
```

---

## B12.3

### B12.3 · `eslint-plugin-lodash` has no type declarations

- **Status:** verified
- **Severity:** P1
- **Area:** `ui`, `web-client`
- **File:** `packages/ui/tsconfig.json`, `apps/web-client/tsconfig.json`
- **Fixed in:** `1c91e1d`

> **Resolved — the diagnosis below was wrong.** `configs/eslint-config/plugins.d.ts` **already
> contains** `declare module "eslint-plugin-lodash";`. The shim was never missing.
>
> The real problem is *visibility*: an ambient declaration only applies where it is part of the
> compilation. `plugins.d.ts` is in `eslint-config`'s own tsconfig `include`, but `ui` and
> `web-client` compile `base.ts` **transitively** — via their `eslint.config.ts` — without it.
>
> Adding a `/// <reference>` to `base.ts` was tried and rejected: it trips
> `@typescript-eslint/triple-slash-reference`.
>
> The actual fix is structural. All 16 other packages use `include: ["src/**/*.ts"]` and therefore
> never typecheck their lint config at all; `ui` (`include: ["."]`) and `web-client`
> (`include: ["**/*"]`) were the only outliers. Both now exclude `eslint.config.ts`, which matches
> the rest of the repo and matches `base.ts`'s own ESLint `ignores` list. No app should be
> typechecking its linter's dependency graph.

**Symptom**
```
base.ts(4,26): error TS7016: Could not find a declaration file for module 'eslint-plugin-lodash'.
  '.../eslint-plugin-lodash/src/index.js' implicitly has an 'any' type.
```
Leaks into `packages/ui` and `apps/web-client`, which pull `eslint-config` into their type graph.

**Cause** — The plugin ships plain JS with no bundled types and has no `@types/` package.
`configs/eslint-config/plugins.d.ts` already exists as the home for exactly this kind of shim, but
has no entry for it.

**Fix** — Add one line to `configs/eslint-config/plugins.d.ts`:

```ts
declare module "eslint-plugin-lodash";
```

Worth asking whether the plugin earns its place at all — it is a large dependency and the repo's
custom rules already cover most of what it is used for.

**Verify**
```bash
pnpm --filter @repo/ui typecheck
```

---

## B12.4

### B12.4 · Unused bindings fail `noUnusedLocals` / `noUnusedParameters`

- **Status:** verified
- **Severity:** P1
- **Area:** `ui`, `aix`, `@repo/mail`
- **Fixed in:** `1c91e1d`

> **Resolved.** Each site was checked for live references before touching it; all seven were
> genuinely dead.
>
> | Site | Action |
> |---|---|
> | `openai.ts:14` `retries` | Parameter **removed** — `getCompletion()` is called twice, both with no argument, and the body never reads it. Abandoned retry intent, not a naming slip. |
> | `OtpEmail.tsx` `imageSection`, `validityText` | **Deleted** — unreferenced style objects. |
> | `form-wrapper.tsx` `safeFormat`, `safeParse` | **Deleted** (~35 lines) — two date helpers defined inside the component and never called; the field passes its value straight through. This also orphaned the `date-fns` `format` import, now removed. |
> | `image-picker.tsx:93` `e` | Handler narrowed to `onClick={() => ...}`. |
> | `multiple-select.tsx:124` `key` | `Object.entries` → `Object.values`. |
>
> Nothing was renamed to `_` to silence it, per the entry's own instruction. Raising
> `unused-imports/no-unused-vars` to `error` remains [E2](../enhancements/template-enhancements.md#e2).

**Symptom** — Seven `TS6133` errors across three packages:

| File | Line | Binding |
|---|---|---|
| `packages/aix/src/providers/openai/openai.ts` | 14 | `retries` (parameter) |
| `packages/@repo/mail/src/emails/admin/OtpEmail.tsx` | 114 | `imageSection` |
| `packages/@repo/mail/src/emails/admin/OtpEmail.tsx` | 149 | `validityText` |
| `packages/ui/src/components/custom/form-wrapper.tsx` | 324 | `safeFormat` |
| `packages/ui/src/components/custom/form-wrapper.tsx` | 341 | `safeParse` |
| `packages/ui/src/components/custom/image-picker.tsx` | 93 | `e` (parameter) |
| `packages/ui/src/components/ui/multiple-select.tsx` | 124 | `key` |

**Cause** — Ordinary drift. The shared tsconfig enables `noUnusedLocals` and `noUnusedParameters`;
ESLint reports the same sites as warnings, and warnings don't fail the build, so they accumulated
until `tsc` made them errors.

**Fix** — Case by case, not with a blanket disable:
- `retries` and `e`: prefix with `_` (both `tsc` and the configured
  `unused-imports/no-unused-vars` treat a leading underscore as intentional).
- `safeFormat`, `safeParse`, `imageSection`, `validityText`, `key`: these look like abandoned
  work. Read each one and either wire it up or delete it — do not rename to `_` to silence it.

Also raise `unused-imports/no-unused-vars` from `warn` to `error` in `eslint-config` so this class
fails fast rather than accumulating. Tracked as [E2](../enhancements/template-enhancements.md#e2).

**Verify**
```bash
pnpm exec turbo typecheck --continue   # aix, @repo/lib (via mail) and ui must pass
```
