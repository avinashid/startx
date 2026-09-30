# Bug register — ROOT

The authoritative list. **Every bug appears here exactly once**, with its current status.
Evidence and fixes live in the linked detail file. Conventions, statuses and the entry template
are in [`../README.md`](../README.md#6-how-to-work-this-folder).

- **Next free ID:** `B46`
- **Last full audit:** 2026-09-30 against HEAD `b7006b0`
- **Open:** 0 · **In progress:** 0 · **Fixed:** 0 · **Verified:** 47

Counts include the four sub-items of B12.

---

## Status board

| | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| open | 0 | 0 | 0 | 0 | **0** |
| in-progress | 0 | 0 | 0 | 0 | 0 |
| fixed | 0 | 0 | 0 | 0 | 0 |
| **verified** | 9 | 12 | 12 | 14 | **47** |

**B1–B45 are all closed.** Measured uncached at the tip of `fix/p0-bugs`:

```
pnpm exec turbo typecheck lint test build format:check --force
Tasks: 69 successful, 69 total   —   exit 0
```

### The previous "50 / 50, exit 0" was wrong, and that matters

This register previously recorded `turbo typecheck lint test build` as **50 / 50, exit 0** at
`712b60f`. That measurement was taken against a warm turbo cache. Re-run with `--force` at the same
tree, **two lint tasks fail**: `web-client#lint` ([B43](config-bugs.md#b43)) and `@repo/ui#lint`
([B45](type-bugs.md#b45)). Both had been failing for some time behind cached green results.

Two lessons are now baked into the conventions: **every status claim in this register must come from
a `--force` run**, and the task list must name `format:check` explicitly — the old command was
missing it, which is how [B36](config-bugs.md#b36) hid a completely inert formatter.

| command | before | after (uncached) |
|---|---|---|
| `turbo typecheck` | 32 / 41 | **41 / 41** |
| `turbo lint` | 15 / 17, 2 failing | **17 / 17, 0 errors** |
| `turbo test` | 7 / 8, 1 failing | **9 / 9, 154 tests** |
| `turbo build` | blocked by `lint` | **22 / 22** |
| `turbo format:check` | *inert — skipped every file* | **19 / 19, real** |

~90 lint *warnings* remain by design — burning them down is
[E2](../enhancements/template-enhancements.md#e2), not a defect. P2 (generator B13–B21) and
P3 (hardening B22–B29, CI B30–B31) were closed in `c104915`.

### B34–B45 were filed and closed in the same pass

B34–B42 came out of the audit run *after* B13–B31 were closed; B43–B45 surfaced while verifying
those fixes, once `--force` runs replaced cached ones. All twelve are now closed.

The most important thing on this board is that **B36 was a regression introduced by the fix for
[B14](config-bugs.md#b14)**. That fix added a `.prettierrc.mjs` carrying a `requirePragma` override
intended for generated biome+prettier workspaces. The file also sits at the root of *this* repo —
it has to, in order to be templated — and Prettier resolves `.prettierrc.mjs` ahead of
`.prettierrc.cjs`. So this repo's own `format:check` has been a silent no-op on every `.ts`/`.js`
file. Proven directly: a deliberately mangled TypeScript file passes `prettier --check` with exit 0,
and checking against `.prettierrc.cjs` explicitly reports **128 files** with style issues.

That masked drift was then half of [B37](config-bugs.md#b37): 9 of 10 packages in a stock
prettier-only scaffold failed `pnpm format:check` immediately after `pnpm install`. B14's own symptom
really was fixed — its status stands — but the fix bought it at a price nobody had measured.

`turbo typecheck lint test build` did not cover `format:check`, which is exactly why 50/50 green and
a completely inert formatter were both true at once. The root `package.json` did not even define a
`format:check` script, though `turbo.json` had declared the task all along; it does now.

**Fixing B36 is what exposed B44 and B45.** Once the formatter and the lint gate started reporting
honestly, two further defects had nowhere left to hide. That is the shape of this whole batch: the
gates were green because they were not looking.

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
| B34 | A frontend-only selection never broadcasts `node`, so the root gets no `lint`/`format`/`test` | startx-cli | [function](function-bugs.md#b34) | verified |
| B37 | A stock prettier-only scaffold fails its own `format:check` — 9 of 10 packages | startx-cli | [config](config-bugs.md#b37) | verified |

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
| B36 | `.prettierrc.mjs`'s `requirePragma` makes this repo's own `format:check` a no-op | root | [config](config-bugs.md#b36) | verified |
| B43 | A stray duplicate `src/eslint.config.ts` fails `web-client#lint` and ships to every scaffold | web-client | [config](config-bugs.md#b43) | verified |
| B45 | `import type React from "react"` trips `import-x/default` — `@repo/ui#lint` fails | @repo/ui | [type](type-bugs.md#b45) | verified |

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
| B35 | `.vscode` settings default to Prettier even when no formatter was chosen | startx-cli | [function](function-bugs.md#b35) | verified |
| B38 | `package new` emits no `format` / `format:check` script | startx-cli | [function](function-bugs.md#b38) | verified |
| B40 | `peerDependencies` bypasses `filterDeps` and `syncDepsWithCatalog` | startx-cli | [function](function-bugs.md#b40) | verified |
| B44 | Per-package prettier never reads the root `.prettierignore`, so `format:check` checks `dist/` | root, template pkgs | [config](config-bugs.md#b44) | verified |

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
| B39 | `package new` leaks generator-only `startx` metadata into user packages | startx-cli | [function](function-bugs.md#b39) | verified |
| B41 | Two incompatible boolean env dialects — `@repo/redis` strict, `@repo/lib` lenient | @repo/redis, @repo/lib | [runtime](runtime-bugs.md#b41) | verified |
| B42 | Shared `eslint-config` ignores `**/dist/**` but not `**/bin/**` | eslint-config | [config](config-bugs.md#b42) | verified |

---

## Grouping by file — what to open first

Historical, for B1–B33 — these four files held 13 of them:

| File | Bugs |
|---|---|
| `apps/startx-cli/src/commands/package.ts` | B18 · B19 · B20 · B21 |
| `apps/startx-cli/src/configs/files.ts` | B13 · B14 |
| `apps/core-server/src/middlewares/` | B1 · B4 · B5 |
| `packages/@repo/lib/src/` | B3 · B25 · B26 · B27 |

B34–B45 clustered differently, and they were worked in this grouping — four file-disjoint batches
in parallel, then the formatting sweep last, once nothing else was still editing the tree:

| File | Bugs |
|---|---|
| prettier config (`.prettierrc.js`, `.prettierrc.mjs`, `writeJSONFile`) | B36 · B37 · B44 |
| `apps/startx-cli/src/commands/package.ts` (`package new`) | B38 · B39 · B40 |
| script/tag gating (`configs/scripts.ts`, `commands/init.ts`) | B34 · B35 |
| env + eslint template config | B41 · B42 · B45 |

**B36 had to go first**: until the formatter told the truth, B37 could not be measured and any
formatting work done in the meantime was unverifiable. That ordering proved itself — closing B36 is
what surfaced B44 and B45, neither of which was visible while the gates were cached green.

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
