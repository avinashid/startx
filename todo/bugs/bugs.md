# Bug register — ROOT

The authoritative list. **Every bug appears here exactly once**, with its current status.
Evidence and fixes live in the linked detail file. Conventions, statuses and the entry template
are in [`../README.md`](../README.md#6-how-to-work-this-folder).

- **Next free ID:** `B43`
- **Last full audit:** 2026-09-22 against HEAD `712b60f`
- **Open:** 9 · **In progress:** 0 · **Fixed:** 0 · **Verified:** 35

Counts include the four sub-items of B12.

---

## Status board

| | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| open | 2 | 1 | 3 | 3 | **9** |
| in-progress | 0 | 0 | 0 | 0 | 0 |
| fixed | 0 | 0 | 0 | 0 | 0 |
| **verified** | 7 | 9 | 8 | 11 | **35** |

**B1–B33 are all closed, and the toolchain is green:**

| command | before | after |
|---|---|---|
| `turbo typecheck` | 32 / 41 | **41 / 41** |
| `turbo lint` | 16 / 17, 1 failing | **17 / 17, 0 errors** |
| `turbo test` | 7 / 8, 1 failing | **9 / 9** |
| `turbo build` | blocked by `lint` | **22 / 22** |

Re-measured at `712b60f`: `turbo typecheck lint test build` is **50 / 50 tasks, exit 0**. The test
count went 8 → 9 because `@repo/lib` had a `vitest.config.ts` but no `test` script, so `turbo test`
had been skipping it entirely.

~90 lint *warnings* remain by design — burning them down is
[E2](../enhancements/template-enhancements.md#e2), not a defect. P2 (generator B13–B21) and
P3 (hardening B22–B29, CI B30–B31) were closed in `c104915`.

### The nine open bugs are new — B34–B42

They came out of the audit run *after* B13–B31 were closed, and none of them existed in the register
before. Two are P0.

The most important thing on this board is that **B36 is a regression introduced by the fix for
[B14](config-bugs.md#b14)**. That fix added a `.prettierrc.mjs` carrying a `requirePragma` override
intended for generated biome+prettier workspaces. The file also sits at the root of *this* repo —
it has to, in order to be templated — and Prettier resolves `.prettierrc.mjs` ahead of
`.prettierrc.cjs`. So this repo's own `format:check` has been a silent no-op on every `.ts`/`.js`
file. Proven directly: a deliberately mangled TypeScript file passes `prettier --check` with exit 0,
and checking against `.prettierrc.cjs` explicitly reports **128 files** with style issues.

That masked drift is then half of [B37](config-bugs.md#b37): 9 of 10 packages in a stock
prettier-only scaffold fail `pnpm format:check` immediately after `pnpm install`. B14's own symptom
really is fixed — the status stands — but the fix bought it at a price nobody had measured.

`turbo typecheck lint test build` does not cover `format:check`, which is exactly why 50/50 green
and a broken formatter are both true at once.

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
| B34 | A frontend-only selection never broadcasts `node`, so the root gets no `lint`/`format`/`test` | startx-cli | [function](function-bugs.md#b34) | open |
| B37 | A stock prettier-only scaffold fails its own `format:check` — 9 of 10 packages | startx-cli | [config](config-bugs.md#b37) | open |

¹ B3's pure logic (TTL unit, code keyspace) was verified; the Redis round-trip and the
attempt-limit path were **not** executed — no Redis or Docker was available on the machine where the
fix was made. See the entry for exactly what remains unproven.

## P1 — toolchain is broken, CI signal is worthless

| ID | Title | Area | Detail | Status |
|---|---|---|---|---|
| B8 | `eslint-config`'s own flat config fails `eslint .`, failing `turbo lint` and `turbo build` repo-wide | eslint-config | [config](config-bugs.md#b8) | **verified** |
| B9 | `tsdown-config` runs `tsc --noEmit` with no `tsconfig.json` | tsdown-config | [config](config-bugs.md#b9) | **verified** |
| B10 | `vitest-config` uses `.ts` import specifiers without `allowImportingTsExtensions` | vitest-config | [config](config-bugs.md#b10) | **verified** |
| B11 | `web-client`'s `test` script exits 1 on an empty suite; shared vitest config not applied | web-client | [config](config-bugs.md#b11) | **verified** |
| B12.1 | `UnwrapColumns` indexes an unconstrained generic — `TS2536` ×3 | @db/drizzle | [type](type-bugs.md#b121) | **verified** |
| B12.2 | `ZodTypeAny` / `QueryKey` need `import type` under `verbatimModuleSyntax` — `TS1485`/`TS1484` ×4 | ui | [type](type-bugs.md#b122) | **verified** |
| B12.3 | `eslint-plugin-lodash` has no types — `TS7016` | eslint-config | [type](type-bugs.md#b123) | **verified** |
| B12.4 | Unused bindings fail `noUnusedLocals`/`noUnusedParameters` — 7 sites | ui, aix, @repo/mail | [type](type-bugs.md#b124) | **verified** |
| B32 | Shared frontend vitest config points `setupFiles` at a path that exists nowhere | vitest-config | [config](config-bugs.md#b32) | **verified** |
| B33 | `tsconfigRootDir` points into `eslint-config`'s own internals, disabling type-aware linting | eslint-config | [config](config-bugs.md#b33) | **verified** |
| B36 | `.prettierrc.mjs`'s `requirePragma` makes this repo's own `format:check` a no-op | root | [config](config-bugs.md#b36) | open |

B32 and B33 were found while fixing B11 and B8. B33 is the more serious of the two: type-aware lint
rules were silently not running for any package.

## P2 — the generator silently emits degraded output

| ID | Title | Area | Detail | Status |
|---|---|---|---|---|
| B13 | `FileCheck` key `.prettier.cjs` misspells `.prettierrc.cjs` — entry dead, file always copied | startx-cli | [config](config-bugs.md#b13) | **verified** |
| B14 | `.prettierignore` is gated on the `biome` tag instead of `prettier` | startx-cli | [config](config-bugs.md#b14) | **verified** |
| B15 | `web-client` gets the wrong `typecheck` script whenever a backend app is co-selected | startx-cli | [function](function-bugs.md#b15) | **verified** |
| B16 | `handlePackageJson` drops `private`, `bin`, `main`, `peerDependencies`, `startx` | startx-cli | [function](function-bugs.md#b16) | **verified** |
| B17 | `init` resolves only one level of the dependency closure; `package add` does full BFS | startx-cli | [function](function-bugs.md#b17) | **verified** |
| B18 | "Overwrite?" merges into the existing tree instead of overwriting | startx-cli | [function](function-bugs.md#b18) | **verified** |
| B19 | Renaming across scopes writes to the template's scope directory | startx-cli | [function](function-bugs.md#b19) | **verified** |
| B20 | `syncDepsWithCatalog` can emit an unresolvable `catalog:` with no warning | startx-cli | [function](function-bugs.md#b20) | **verified** |
| B21 | Dead ternary and a misleading log line in `installRootDependencies` | startx-cli | [function](function-bugs.md#b21) | **verified** |
| B35 | `.vscode` settings default to Prettier even when no formatter was chosen | startx-cli | [function](function-bugs.md#b35) | open |
| B38 | `package new` emits no `format` / `format:check` script | startx-cli | [function](function-bugs.md#b38) | open |
| B40 | `peerDependencies` bypasses `filterDeps` and `syncDepsWithCatalog` | startx-cli | [function](function-bugs.md#b40) | open |

## P3 — hardening, papercuts, dead code

| ID | Title | Area | Detail | Status |
|---|---|---|---|---|
| B22 | `/files` serves the whole `storage/` directory with no authentication | core-server | [security](security-bugs.md#b22) | **verified** |
| B23 | `fileUpload()` has no size limits — unbounded in-memory uploads on every route | core-server | [security](security-bugs.md#b23) | **verified** |
| B24 | CORS is registered after the body parsers | core-server | [security](security-bugs.md#b24) | **verified** |
| B25 | `resolveSameSite` returns `"lax"` in both branches — dead ternary | @repo/lib | [security](security-bugs.md#b25) | **verified** |
| B26 | Cookie module throws at **import** time when `COOKIE_DOMAIN` is unset | @repo/lib | [runtime](runtime-bugs.md#b26) | **verified** |
| B27 | `Paginator.getPage` does no validation on user-controlled `page` / `limit` | @repo/lib | [function](function-bugs.md#b27) | **verified** |
| B28 | No helmet, no rate limiting, no request-size caps in the server template | core-server | [security](security-bugs.md#b28) | **verified** |
| B29 | `serve-static.ts` is dead code with a path that wouldn't resolve after bundling | core-server | [runtime](runtime-bugs.md#b29) | **verified** |
| B30 | CI publishes to npm on every push to `main` with no gate | ci | [ci](ci-bugs.md#b30) | **verified** |
| B31 | `.npmignore` excludes the `bin` target; publishing works only by npm's force-include | ci | [ci](ci-bugs.md#b31) | **verified** |
| B39 | `package new` leaks generator-only `startx` metadata into user packages | startx-cli | [function](function-bugs.md#b39) | open |
| B41 | Two incompatible boolean env dialects — `@repo/redis` strict, `@repo/lib` lenient | @repo/redis, @repo/lib | [runtime](runtime-bugs.md#b41) | open |
| B42 | Shared `eslint-config` ignores `**/dist/**` but not `**/bin/**` | eslint-config | [config](config-bugs.md#b42) | open |

---

## Grouping by file — what to open first

Historical, for B1–B33 — these four files held 13 of them:

| File | Bugs |
|---|---|
| `apps/startx-cli/src/commands/package.ts` | B18 · B19 · B20 · B21 |
| `apps/startx-cli/src/configs/files.ts` | B13 · B14 |
| `apps/core-server/src/middlewares/` | B1 · B4 · B5 |
| `packages/@repo/lib/src/` | B3 · B25 · B26 · B27 |

For the nine that are open now, the grouping is different — and two clusters cover seven of them:

| File | Bugs |
|---|---|
| prettier config (`.prettierrc.mjs`, `.prettierrc.cjs`, `writeJSONFile`) | B36 · B37 |
| `apps/startx-cli/src/commands/package.ts` (`package new`) | B38 · B39 · B40 |
| script/tag gating (`configs/scripts.ts`, `commands/init.ts`) | B34 · B35 |

Suggested order: **B36 first**, because until the formatter tells the truth, B37 cannot be measured
and any formatting work done in the meantime is unverifiable. Then B37, then B34 — that is both P0s
and the P1. B38–B42 are independent of each other and of everything above.

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
