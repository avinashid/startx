# Bug register — ROOT

The authoritative list. **Every bug appears here exactly once**, with its current status.
Evidence and fixes live in the linked detail file. Conventions, statuses and the entry template
are in [`../README.md`](../README.md#6-how-to-work-this-folder).

- **Next free ID:** `B32`
- **Last full audit:** 2026-09-22 against HEAD `dcb2bb1`
- **Open:** 27 · **In progress:** 0 · **Fixed:** 0 · **Verified:** 7

Counts include the four sub-items of B12.

---

## Status board

| | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| open | 0 | 9 | 9 | 9 | **27** |
| in-progress | 0 | 0 | 0 | 0 | 0 |
| fixed | 0 | 0 | 0 | 0 | 0 |
| **verified** | 7 | 0 | 0 | 0 | **7** |

**All P0 defects are closed.** `turbo typecheck` now reports 33 of 41 tasks passing, up from 32 —
`core-server` compiles for the first time. The 8 remaining failures are the P1 toolchain bugs
(B8–B12), which are untouched.

---

## P0 — generated output is broken, or a security weakness is live

| ID | Title | Area | Detail | Status |
|---|---|---|---|---|
| B1 | `errorMiddleware` has arity 3, so Express never calls it as an error handler | core-server | [runtime](runtime-bugs.md#b1) | **verified** |
| B2 | `defineEnv` deletes keys from `process.env`, including `NODE_ENV` | @repo/env | [function](function-bugs.md#b2) | **verified** |
| B3 | OTP TTL is 3.5 days instead of 5 minutes; 9 000-code space, no attempt limit | @repo/lib | [function](function-bugs.md#b3) | **verified** ¹ |
| B4 | `auth-middleware` imports `TokenModule` from a module that doesn't export it | core-server | [type](type-bugs.md#b4) | **verified** |
| B5 | `Request.user` type contradicts what sessions actually store | core-server | [type](type-bugs.md#b5) | **verified** |
| B6 | `REDIS_CLUSTER_MODE=false` enables cluster mode | @repo/redis | [runtime](runtime-bugs.md#b6) | **verified** |
| B7 | `.env.example` secrets are 24 chars; the code requires 32 | root | [config](config-bugs.md#b7) | **verified** |

¹ B3's pure logic (TTL unit, code keyspace) was verified; the Redis round-trip and the
attempt-limit path were **not** executed — no Redis or Docker was available on the machine where the
fix was made. See the entry for exactly what remains unproven.

## P1 — toolchain is broken, CI signal is worthless

| ID | Title | Area | Detail | Status |
|---|---|---|---|---|
| B8 | `eslint-config`'s own flat config fails `eslint .`, failing `turbo lint` and `turbo build` repo-wide | eslint-config | [config](config-bugs.md#b8) | open |
| B9 | `tsdown-config` runs `tsc --noEmit` with no `tsconfig.json` | tsdown-config | [config](config-bugs.md#b9) | open |
| B10 | `vitest-config` uses `.ts` import specifiers without `allowImportingTsExtensions` | vitest-config | [config](config-bugs.md#b10) | open |
| B11 | `web-client`'s `test` script exits 1 on an empty suite; shared vitest config not applied | web-client | [config](config-bugs.md#b11) | open |
| B12.1 | `UnwrapColumns` indexes an unconstrained generic — `TS2536` ×3 | @db/drizzle | [type](type-bugs.md#b121) | open |
| B12.2 | `ZodTypeAny` / `QueryKey` need `import type` under `verbatimModuleSyntax` — `TS1485`/`TS1484` ×4 | ui | [type](type-bugs.md#b122) | open |
| B12.3 | `eslint-plugin-lodash` has no types — `TS7016` | eslint-config | [type](type-bugs.md#b123) | open |
| B12.4 | Unused bindings fail `noUnusedLocals`/`noUnusedParameters` — 7 sites | ui, aix, @repo/mail | [type](type-bugs.md#b124) | open |

## P2 — the generator silently emits degraded output

| ID | Title | Area | Detail | Status |
|---|---|---|---|---|
| B13 | `FileCheck` key `.prettier.cjs` misspells `.prettierrc.cjs` — entry dead, file always copied | startx-cli | [config](config-bugs.md#b13) | open |
| B14 | `.prettierignore` is gated on the `biome` tag instead of `prettier` | startx-cli | [config](config-bugs.md#b14) | open |
| B15 | `web-client` gets the wrong `typecheck` script whenever a backend app is co-selected | startx-cli | [function](function-bugs.md#b15) | open |
| B16 | `handlePackageJson` drops `private`, `bin`, `main`, `peerDependencies`, `startx` | startx-cli | [function](function-bugs.md#b16) | open |
| B17 | `init` resolves only one level of the dependency closure; `package add` does full BFS | startx-cli | [function](function-bugs.md#b17) | open |
| B18 | "Overwrite?" merges into the existing tree instead of overwriting | startx-cli | [function](function-bugs.md#b18) | open |
| B19 | Renaming across scopes writes to the template's scope directory | startx-cli | [function](function-bugs.md#b19) | open |
| B20 | `syncDepsWithCatalog` can emit an unresolvable `catalog:` with no warning | startx-cli | [function](function-bugs.md#b20) | open |
| B21 | Dead ternary and a misleading log line in `installRootDependencies` | startx-cli | [function](function-bugs.md#b21) | open |

## P3 — hardening, papercuts, dead code

| ID | Title | Area | Detail | Status |
|---|---|---|---|---|
| B22 | `/files` serves the whole `storage/` directory with no authentication | core-server | [security](security-bugs.md#b22) | open |
| B23 | `fileUpload()` has no size limits — unbounded in-memory uploads on every route | core-server | [security](security-bugs.md#b23) | open |
| B24 | CORS is registered after the body parsers | core-server | [security](security-bugs.md#b24) | open |
| B25 | `resolveSameSite` returns `"lax"` in both branches — dead ternary | @repo/lib | [security](security-bugs.md#b25) | open |
| B26 | Cookie module throws at **import** time when `COOKIE_DOMAIN` is unset | @repo/lib | [runtime](runtime-bugs.md#b26) | open |
| B27 | `Paginator.getPage` does no validation on user-controlled `page` / `limit` | @repo/lib | [function](function-bugs.md#b27) | open |
| B28 | No helmet, no rate limiting, no request-size caps in the server template | core-server | [security](security-bugs.md#b28) | open |
| B29 | `serve-static.ts` is dead code with a path that wouldn't resolve after bundling | core-server | [runtime](runtime-bugs.md#b29) | open |
| B30 | CI publishes to npm on every push to `main` with no gate | ci | [ci](ci-bugs.md#b30) | open |
| B31 | `.npmignore` excludes the `bin` target; publishing works only by npm's force-include | ci | [ci](ci-bugs.md#b31) | open |

---

## Grouping by file — what to open first

Fixing these three files closes 13 of the 34 defects:

| File | Bugs |
|---|---|
| `apps/startx-cli/src/commands/package.ts` | B18 · B19 · B20 · B21 |
| `apps/startx-cli/src/configs/files.ts` | B13 · B14 |
| `apps/core-server/src/middlewares/` | B1 · B4 · B5 |
| `packages/@repo/lib/src/` | B3 · B25 · B26 · B27 |

---

## Investigated and dismissed

Recorded so nobody re-opens them.

### `--eslint` / `--no-eslint` cannot be distinguished from the default — **not a bug**

The concern: `package.ts:240` reads `options.eslint === false` and `options.eslint ?? true`, which
would misbehave if Commander defaulted the flag to `true` when both `--eslint` and `--no-eslint`
are declared. That would make the "ESLint is not installed — install it?" prompt at `package.ts:251`
unreachable.

Verified empirically against the vendored Commander version:

```
add x              -> {"install":true}
add x --eslint     -> {"install":true,"eslint":true}
add x --no-eslint  -> {"install":true,"eslint":false}
```

`eslint` is left **undefined** when neither flag is passed, because the positive `--eslint` option is
declared first. `resolveEslintPreference` behaves as designed. No change needed.

### `package new --dir packages/internal/my-utils` falls outside the workspace globs — **not a bug**

`pnpm-workspace.yaml` includes `packages/*/*`, which matches `packages/internal/my-utils`. The
README example works. A custom `--dir` *outside* `apps/`, `packages/` or `configs/` would still not
be linked — that gap is tracked as [E4](../enhancements/cli-enhancements.md#e4), not as a defect.

### `.npmignore` breaks the published CLI — **downgraded, not invalid**

`.npmignore` does list `apps/*/dist` while `bin` points into it, but unpacking the published
`startx-1.1.60` tarball confirms `apps/startx-cli/dist/index.mjs` **is** present — npm
force-includes the `bin` target. It works today. Kept as [B31](ci-bugs.md#b31) at P3 because it
relies on packer-specific behaviour.
