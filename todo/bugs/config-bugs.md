# Config bugs

Wrong configuration files and wrong entries in the generator's static data tables
(`FileCheck`, `DepCheck`). The code is fine; the data it reads is not.
Register: [`bugs.md`](bugs.md).

Contents: [B7](#b7) · [B8](#b8) · [B9](#b9) · [B10](#b10) · [B11](#b11) · [B13](#b13) · [B14](#b14) ·
[B32](#b32) · [B33](#b33) · [B36](#b36) · [B37](#b37) · [B42](#b42)

---

## B7

### B7 · `.env.example` secrets are 24 chars; the code requires 32

- **Status:** verified
- **Severity:** P0
- **Area:** root template
- **File:** `.env.example:3-4`, enforced by `packages/@repo/lib/src/token-module/index.ts:7-8`
- **Fixed in:** `caca799`

> **Resolved.** `.env.example` rewritten: secrets are now 66-character `CHANGE_ME_...` placeholders
> (≥32 required) and `INTEGRATION_ENCRYPTION_KEY` is exactly 64 hex chars as
> `EncryptionModule` requires, each with the `openssl rand -hex 32` command that generates a real
> one. The missing variables listed below were added and the file grouped into sections.
>
> Writing it surfaced one more blocker: `REDIS_USERNAME`/`REDIS_PASSWORD` were `z.string()` with no
> default, so the empty values in the example file failed validation — unauthenticated Redis is
> normal in dev. Both now `.default("")`.
>
> The `min(32)` and the 64-hex length check were left alone: they are correct.
> Generating real secrets during `init` remains open as [F2](../features/cli-features.md#f2).

**Symptom** — The documented first step (`cp .env.example .env`, then start the server) fails before
the server listens:

```
Invalid environment variables:
  ❌ ACCESS_TOKEN_SECRET: String must contain at least 32 character(s)
```

**Cause** — The placeholders are shorter than the schema allows:

```bash
ACCESS_TOKEN_SECRET  = your_access_token_secret    # 24 chars
REFRESH_TOKEN_SECRET = your_refresh_token_secret   # 25 chars
```
```ts
ACCESS_TOKEN_SECRET:  z.string().min(32),
REFRESH_TOKEN_SECRET: z.string().min(32),
```

The `min(32)` is correct and should stay — it's the example file that is wrong.

**Fix** — Put a value of the right shape in the example, and say how to generate a real one:

```bash
# generate with: openssl rand -hex 32
ACCESS_TOKEN_SECRET  = replace_me_with_64_hex_chars_openssl_rand_hex_32_aaaaaaaaaaaaaaaa
REFRESH_TOKEN_SECRET = replace_me_with_64_hex_chars_openssl_rand_hex_32_bbbbbbbbbbbbbbbb
```

Better still: have `startx init` generate real random secrets into a `.env` for the scaffolded
project, so a fresh workspace boots without manual editing. Tracked as
[F2](../features/cli-features.md#f2).

While in this file — `.env.example` omits several variables the templates actually require:
`REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `CORS_URL`,
`INTEGRATION_ENCRYPTION_KEY`, `FILE_STORAGE_PATH`, `LOG_LEVEL`. Add them, grouped and commented.

**Verify**
```bash
cp .env.example .env && pnpm --filter core-server dev   # must not fail env validation
```

---

## B8

### B8 · `eslint-config`'s own flat config fails `eslint .`, failing lint and build repo-wide

- **Status:** verified
- **Severity:** P1
- **Area:** `eslint-config`
- **File:** `configs/eslint-config/eslint.config.ts`
- **Fixed in:** `1c91e1d`

> **Resolved.** `eslint.config.ts` now extends its own `baseConfig`, exactly like every other
> package in the repo.
>
> Making the package lint itself for the first time exposed three further problems, all now fixed:
> **(1)** [B33](#b33) — `tsconfigRootDir` was misconfigured, so all of `src/configs/**` failed with
> `Parsing error: ... was not found by the project service`. **(2)** 21 × `no-unsafe-enum-comparison`
> across 7 rule files, from comparing `node.type` (an `AST_NODE_TYPES` enum) against string literals;
> all rewritten to use `AST_NODE_TYPES.X` members. **(3)** `import-x/default` on
> `eslint-plugin-react-hooks@5`, which is CJS with no `default` key — suppressed at that one import
> with the reason recorded inline.
>
> `eslint .` → **0 errors** (28 warnings, tracked as
> [E2](../enhancements/template-enhancements.md#e2)). The 24 rule tests still pass, so the
> `AST_NODE_TYPES` rewrite is behaviour-preserving. `turbo lint` 17/17 and `turbo build` 22/22.

**Symptom**
```
eslint-config:lint: Oops! Something went wrong! :(
eslint-config:lint: You are linting ".", but all of the files matching the glob pattern "." are ignored.
eslint-config:lint: [ELIFECYCLE] Command failed with exit code 2.
 ERROR  run failed: command exited (2)
```

This is the **only** failing lint task, and it fails the whole root `turbo lint`. Because
`turbo.json` declares `build.dependsOn: ["lint", "^build"]`, it also blocks `turbo build`, and
`typecheck.dependsOn: ["^typecheck", "build"]` drags it into `turbo typecheck` too. One file breaks
all three root commands.

**Cause** — The package that *provides* the shared ESLint configuration does not configure ESLint
for itself:

```ts
// configs/eslint-config/eslint.config.ts
export default [{}];
```

A config array with no `files` entry matches nothing, so ESLint reports every file as ignored and
exits 2.

**Fix** — Have the config package eat its own cooking, like every other package in the repo:

```ts
import { baseConfig } from "./src/configs/base.ts";
import { extend } from "./src/configs/extend.ts";

export default extend(baseConfig);
```

If self-linting genuinely causes a bootstrap problem, the fallback is to remove the `lint` script
from `configs/eslint-config/package.json` so Turbo skips the package — but fix it properly first.

**Verify**
```bash
pnpm exec turbo lint          # must exit 0
```

---

## B9

### B9 · `tsdown-config` runs `tsc --noEmit` with no `tsconfig.json`

- **Status:** verified
- **Severity:** P1
- **Area:** `tsdown-config`
- **File:** `configs/tsdown-config/package.json:9`
- **Fixed in:** `1c91e1d`

> **Resolved.** Added `configs/tsdown-config/tsconfig.json` extending
> `typescript-config/tsconfig.node.json`, plus the `typescript-config: "workspace:*"` devDependency
> that `startx.requiredDevDeps` already claimed but `package.json` never declared.
>
> `pnpm --filter tsdown-config typecheck` exits 0.

**Symptom** — `pnpm --filter tsdown-config typecheck` prints the full `tsc` help text and exits 1:

```
Version 5.9.3
tsc: The TypeScript Compiler - Version 5.9.3
COMMON COMMANDS
  tsc
  Compiles the current project (tsconfig.json in the working directory.)
  ...
```

**Cause** — The package declares `"typecheck": "tsc --noEmit"` but its directory contains only
`package.json` and `src/config/tsdown.base.ts`. With no `tsconfig.json` and no file arguments, `tsc`
falls back to printing usage. It is the only workspace package missing a `tsconfig.json`.

**Fix** — Add `configs/tsdown-config/tsconfig.json`, matching its siblings:

```json
{
  "extends": "typescript-config/tsconfig.node.json",
  "include": ["src/**/*.ts"]
}
```

and add `typescript-config: "workspace:*"` to its `devDependencies` (its `startx.requiredDevDeps`
already lists it, so only the real dependency is missing).

**Verify**
```bash
pnpm --filter tsdown-config typecheck   # must exit 0
```

---

## B10

### B10 · `vitest-config` uses `.ts` import specifiers without `allowImportingTsExtensions`

- **Status:** verified
- **Severity:** P1
- **Area:** `vitest-config`
- **File:** `configs/vitest-config/src/node.ts:1`, `configs/vitest-config/src/frontend.ts:1`
- **Fixed in:** `1c91e1d`

> **Resolved — but not the way this entry originally proposed.** Both suggestions here were wrong:
>
> - *Extensionless* (`"./base"`) fails under `moduleResolution: nodenext`, which the shared config
>   uses (`TS2835`).
> - *`.js`* satisfies `tsc`, but **breaks at runtime**: Vite/Vitest resolve the specifier literally
>   and there is no `base.js` on disk. Caught by running the test suite —
>   `ERR_MODULE_NOT_FOUND: .../vitest-config/src/base.js`.
>
> The correct fix for a package that **ships raw TypeScript source** is to keep `./base.ts` and set
> `"allowImportingTsExtensions": true` in `configs/typescript-config/tsconfig.common.json` (it was
> explicitly `false`). That option requires `noEmit`, which the shared config already sets, so it is
> legal for every consumer.
>
> Lesson for the next one of these: typecheck **and** run the suite. `tsc` passing proved nothing
> about the loader.

**Symptom**
```
../vitest-config/src/node.ts(1,34): error TS5097:
  An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.
```

Reported from *consumers* — `eslint-config` and `ui` both fail typecheck because of a file in a
package they merely depend on.

**Cause**
```ts
import { baseVitestConfig } from "./base.ts";
```

The shared tsconfig does not enable `allowImportingTsExtensions`, and since `vitest-config` exports
raw `.ts` source (`"exports": "./src/..."`), the error propagates into every package that pulls it
into its type graph.

**Fix** — Drop the extension in both files:

```ts
import { baseVitestConfig } from "./base";
```

Vite and Vitest resolve this fine. If the extension is wanted for ESM correctness, use `.js`
(TypeScript's convention for `NodeNext`) rather than `.ts` — other packages in this repo already do
exactly that, e.g. `packages/@repo/lib/src/extra/index.ts` imports `"./pagination-module.js"`.
Pick one convention and apply it repo-wide.

**Verify**
```bash
pnpm --filter eslint-config typecheck && pnpm --filter @repo/ui typecheck
```

---

## B11

### B11 · `web-client`'s `test` script exits 1 on an empty suite, and the shared vitest config isn't applied

- **Status:** verified
- **Severity:** P1
- **Area:** `web-client`
- **File:** `apps/web-client/package.json`, `apps/web-client/vitest.config.ts`
- **Fixed in:** `1c91e1d`

> **Resolved — the diagnosis below is wrong about the cause.** It is not that the shared config was
> "not being picked up": **`apps/web-client/vitest.config.ts` did not exist at all.** web-client was
> the only one of 18 packages without one, so Vitest fell back to its built-in defaults — which is
> exactly why the printed include patterns differed and why `passWithNoTests` (set in
> `vitest-config/src/base.ts`) never applied.
>
> Created it, matching `ui`'s two-line form, and added the missing `vitest-config` devDependency.
> No `--passWithNoTests` flag was needed — inheriting the shared config was the whole fix.
>
> This also surfaced [B32](#b32): the shared frontend config's `setupFiles` points at a file that
> exists in no package.
>
> `pnpm --filter web-client test` exits 0; `turbo test` 8/8.

**Symptom** — The only failing test task:
```
web-client:test: No test files found, exiting with code 1
web-client:test: include: **/*.{test,spec}.?(c|m)[jt]s?(x)
web-client:test: exclude: **/node_modules/**, **/.git/**
```

Every other package with no tests exits **0** with a different include pattern:
```
core-server:test: No test files found, exiting with code 0
core-server:test: include: src/**/*.{test,spec}.{ts,tsx}
core-server:test: exclude: **/node_modules/**, **/dist/**
```

**Cause** — Two separate problems visible in that output.

1. The include/exclude patterns printed for `web-client` are **Vitest's built-in defaults**, not the
   shared `vitest-config` ones. The shared frontend config is not being picked up — check whether
   `apps/web-client/vitest.config.ts` actually imports `vitest-config/frontend`, and whether the
   Vite plugin chain is overriding `test.include`.
2. `vitest run` exits 1 when it matches no files. Packages that inherit the shared config get
   `passWithNoTests` from `configs/vitest-config/src/base.ts`; `web-client` doesn't, so it fails.

Fixing (1) most likely fixes (2) as a side effect — confirm before adding the flag by hand.

**Fix**
1. Make `apps/web-client/vitest.config.ts` extend `vitest-config/frontend`, the same way the other
   apps extend `vitest-config/node`. Note the shared frontend config declares
   `setupFiles: ["./src/__tests__/setup.ts"]`, which does not exist in `web-client` — create it or
   make the setup file optional.
2. Re-run and confirm the printed include pattern is the shared one.

**Verify**
```bash
pnpm --filter web-client test
# exit 0, and the printed include pattern must match the other packages'
```

---

## B13

### B13 · `FileCheck` key `.prettier.cjs` misspells `.prettierrc.cjs`

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/configs/files.ts:11`
- **Fixed in:** `c104915`

> **Resolved.** Key corrected to `.prettierrc.cjs` with `tags: ["prettier"]`, exactly as proposed
> below. The same pass also added a sibling entry, `.prettierrc.mjs`, gated on
> `["prettier", "biome"]` — see [B14](#b14) for why it needs both tags.

**Symptom** — The prettier config is copied into **every** generated workspace, including ones that
did not select prettier. The `FileCheck` entry intended to gate it has no effect at all.

**Cause** — The table is keyed by filename, and the key is misspelled:

```ts
".prettier.cjs": { tags: ["prettier"] },    // ← no such file
```

The real file in the repo root is **`.prettierrc.cjs`**. Because `copyValidatedFilesFromFolder`
treats an unknown filename as "copy unconditionally"…

```ts
const checked = FileCheck[file];
if (checked && !checked.tags.every(tag => tags.has(tag))) continue;   // undefined ⇒ no skip
```

…the dead key means the file is never gated. The entry is silently doing nothing.

This is masked today because both formatter choices (`prettier` and `prettier + biome`) add the
`prettier` tag, so the file is always wanted anyway. It will bite the moment a prettier-free option
exists.

**Fix** — Correct the key:
```ts
".prettierrc.cjs": { tags: ["prettier"] },
```

Then add a guard so this class of typo cannot recur: a unit test that asserts every key in
`FileCheck` exists as a real file in the template root, or a startup assertion in dev mode.
Tracked as [E3](../enhancements/cli-enhancements.md#e3).

**Verify**
```bash
# a test asserting every FileCheck key resolves to a real path in the template
```

---

## B14

### B14 · `.prettierignore` is gated on the `biome` tag instead of `prettier`

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/configs/files.ts:17`
- **Fixed in:** `c104915`

> **Resolved — not by the re-gate below, which was tried and rejected as a regression.** Simply
> swapping `tags: ["biome"]` for `["prettier"]` ships the file's existing *contents* unchanged, and
> those contents are biome-specific: they exclude `**/*.ts`/`.tsx`/`.js`/`.jsx` as "handled by
> biome." Copied as-is into a prettier-only workspace, that measured **0** `.ts`/`.tsx` files
> formatted, against 91 files (76 of them `.ts`/`.tsx`) with the file absent entirely.
>
> What shipped instead: `.prettierignore` slimmed to build output plus `pnpm-lock.yaml` and
> `CHANGELOG.md` — no source exclusions — and a new `.prettierrc.mjs` carrying a `requirePragma`
> override, gated on **both** `["prettier", "biome"]`. It has to be gated on both: it `import`s
> `.prettierrc.cjs`, so shipping it to a workspace without that file makes prettier exit 2 with
> "Cannot find module." The same pass narrowed the per-package `format`/`format:check` scripts to
> `src` plus a top-level glob with `--no-error-on-unmatched-pattern` — the original symptom
> (prettier rewriting `dist/`/`coverage/`) was still live otherwise, and the unmatched-pattern flag
> is load-bearing because `configs/typescript-config` has no `src/`.
>
> One thing this pass didn't anticipate: `.prettierrc.mjs` sits at the startx repo's own root (it
> has to, to be templated), and prettier resolves it ahead of `.prettierrc.cjs` there too — so the
> `requirePragma` override written for generated biome+prettier workspaces also silently suppresses
> the master repo's own `format`/`format:check` for every `.ts`/`.js` file. Filed as [B36](#b36).

**Symptom** — Exactly inverted behaviour:

| Formatter chosen | `.prettierrc.cjs` | `.prettierignore` |
|---|---|---|
| `prettier` | copied | **missing** |
| `prettier + biome` | copied | copied |

A prettier-only workspace gets a prettier config with no ignore file. This does **not** reach
`pnpm format` / `turbo run format`: turbo runs prettier inside each package, and a root-level
`.prettierignore` is never read from there. The real impact is editor integrations (format-on-save
reads ignore files from the workspace root) and any `prettier` invocation run directly from the
repo root — both would format build output and generated files as if they were source.

**Cause**
```ts
".prettierignore": { tags: ["biome"] },
```

The tag is simply wrong — a prettier ignore file has nothing to do with biome.

**Fix**
```ts
".prettierignore": { tags: ["prettier"] },
```

While here, review the rest of the table for the same kind of slip. `".prettierignore"` and
`"biome.json"` sitting adjacent with the same tag is what made this easy to miss.

**Verify**
```bash
# scaffold with formatter = "prettier", then:
test -f <proj>/.prettierignore
```

---

## B32

### B32 · Shared frontend vitest config points `setupFiles` at a path that exists nowhere

- **Status:** verified
- **Severity:** P1
- **Area:** `vitest-config`
- **File:** `configs/vitest-config/src/frontend.ts`
- **Fixed in:** `1c91e1d`
- **Found while fixing:** [B11](#b11)

> **Resolved.** The `setupFiles` line was removed from `configs/vitest-config/src/frontend.ts`
> rather than repaired. Repairing it means picking a path, and any path the *shared* config names
> has to exist in every consumer — so the config would have to ship a `setup.ts` into `ui`,
> `web-client` and every frontend package the generator emits, whether or not they want one. A
> package that genuinely needs setup now declares it in its own `vitest.config.ts`, where the
> relative path resolves against something that exists.

**Symptom** — Latent. Any frontend package that writes its first test fails immediately with a
missing-module error for a setup file it never created.

**Cause**
```ts
export default baseVitestConfig({
  environment: "jsdom",
  setupFiles: ["./src/__tests__/setup.ts"],   // exists in no package in the repo
  ...
});
```

Confirmed by searching the whole tree: **no `setup.ts` exists anywhere**, and neither consumer
(`ui`, `web-client`) has a `src/__tests__/` directory. Vitest only loads `setupFiles` when it has
test files to run, so with zero tests everywhere the breakage stayed invisible.

**Fix** — Removed the `setupFiles` line. A package that needs setup should declare it in its own
`vitest.config.ts`, where the path is relative to something that actually exists. Re-adding it to
the shared config means also shipping the file to every consumer.

**Verify**
```bash
pnpm exec turbo test --continue   # 8/8, and a new frontend test must not fail on a missing setup file
```

---

## B33

### B33 · `tsconfigRootDir` points into `eslint-config`'s own internals, disabling type-aware linting

- **Status:** verified
- **Severity:** P1
- **Area:** `eslint-config`
- **File:** `configs/eslint-config/src/configs/base.ts:55`
- **Fixed in:** `1c91e1d`
- **Found while fixing:** [B8](#b8)

> **Resolved.** `tsconfigRootDir` is now `process.cwd()`. Turbo invokes ESLint once per package, so
> `cwd` is the package root — the directory that actually holds that package's `tsconfig.json`.
>
> The parsing error was the visible half of this. The larger half was silent: because `base.ts` is
> the config every package imports, every package in the repo had been pointing the
> typescript-eslint project service at `configs/eslint-config/src/configs`, so type-aware rules
> were not running repo-wide. `aix` alone reports 91 warnings after the fix. Those warnings are not
> a regression — they are the first output from rules that had never executed, and burning them
> down is tracked as [E2](../enhancements/template-enhancements.md#e2), not as a defect here.

**Symptom** — Every file in `configs/eslint-config/src/configs/` failed to lint with:

```
0:0  error  Parsing error: .../src/configs/base.ts was not found by the project service.
            Consider either including it in the tsconfig.json or including it in allowDefaultProject
```

More importantly, this silently limited how many type-aware rules actually ran across the repo.
After the fix `aix` alone reports 91 warnings where it previously reported far fewer — those rules
had not been running.

**Cause**
```ts
parserOptions: {
  projectService: true,
  tsconfigRootDir: import.meta.dirname,   // = configs/eslint-config/src/configs
},
```

`import.meta.dirname` is the directory of **`base.ts` itself**, not of the package being linted.
Because `base.ts` is the shared config every package imports, every package in the repo was telling
the typescript-eslint project service to root itself in `configs/eslint-config/src/configs`.

**Fix**
```ts
tsconfigRootDir: process.cwd(),
```

ESLint is invoked per-package by Turbo, so `cwd` is the package root — which is where each
package's `tsconfig.json` lives.

**Verify**
```bash
pnpm exec turbo lint --continue   # 17/17, 0 errors, no "project service" parsing errors
```

---

## B36

### B36 · `.prettierrc.mjs`'s `requirePragma` makes the repo's own `format:check` a no-op

- **Status:** open
- **Severity:** P1
- **Area:** root / `startx-cli`
- **File:** `.prettierrc.mjs:14-15`
- **Found while fixing:** [B14](#b14)

**Symptom** — `pnpm format` / `pnpm format:check` at the repo root, and inside any package, report
success across the whole master repo without actually checking a single `.ts`/`.js` file's
formatting. A deliberately mangled file (`const    x=1;;;`, no trailing commas) dropped at the repo
root **passes** `pnpm exec prettier --check` with exit 0.

**Cause** — `.prettierrc.mjs:14-15` sets `overrides: [{ files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
options: { requirePragma: true } }]`. `requirePragma: true` tells prettier to skip any file that
does not carry an `@format` (or `@prettier`) comment — and no source file anywhere in the repo
carries one, so every `.ts`/`.js`/etc. file is silently skipped, not verified.

That override exists on purpose: [B14](#b14)'s fix introduced `.prettierrc.mjs` specifically so a
generated **prettier + biome** workspace can hand JS/TS files to biome while still using prettier
for JSON/CSS/markdown — `requirePragma` is how it keeps prettier off files nothing tags with
`@format`. The problem is placement, not intent: `.prettierrc.mjs` has to live at the *root* of the
startx repo, because that root is itself the template source the generator copies from. Prettier
resolves `.prettierrc.mjs` ahead of `.prettierrc.cjs`
(`pnpm exec prettier --find-config-path apps/startx-cli/src/configs/files.ts` → `.prettierrc.mjs`,
not `.prettierrc.cjs`), so the override written for *generated workspaces* also silently governs the
master repo's own `format`/`format:check`, where no `@format` pragma convention exists and none was
ever intended.

The drift this has masked is not hypothetical: `pnpm exec prettier --check --config .prettierrc.cjs
"apps/**/src/**/*.{ts,tsx}" "packages/**/src/**/*.{ts,tsx}" "configs/**/src/**/*.{ts,tsx}"` — i.e.
the ruleset the repo actually intends to enforce on itself — reports **128 files** with style
issues that `format:check` has been reporting clean.

**Fix** — The override is wanted in a *generated* biome+prettier workspace, but must never apply to
startx's own source, and one file can't have two different `requirePragma` values depending on who
resolves it. Recommended approach: stop shipping the override as a discoverable root config file at
all. Move the `requirePragma` block into the template-writing code path (e.g. synthesize it into the
generated `.prettierrc.mjs`'s contents at copy time, alongside the existing `.prettierrc.cjs` import
rewrite that `files.ts` already performs) rather than keeping it as a literal file prettier can find
by walking up from the startx repo's own source tree. That keeps the override real for consumers
while removing the config prettier resolves when linting startx itself. A cheaper interim mitigation
— pin `.prettierrc.cjs` explicitly via `--config` in the root `format`/`format:check` scripts — treats
the symptom but leaves the same trap for the next contributor who runs bare `prettier --check`.

**Verify**
```bash
pnpm exec prettier --find-config-path apps/startx-cli/src/configs/files.ts   # must not print .prettierrc.mjs
pnpm format:check   # must fail once real drift exists, not pass unconditionally
```

---

## B37

### B37 · A freshly scaffolded prettier-only workspace fails its own `format:check`

- **Status:** open
- **Severity:** P0
- **Area:** `startx-cli` + template sources
- **File:** `packages/@repo/lib/src/file-system-module/index.ts:34`

**Symptom** — Scaffolding a real workspace (`cli` + `web-client`, formatter = `prettier` only),
running `pnpm install`, then `pnpm format:check` fails immediately: **9 of 10 packages** report
"Code style issues found", exit code 1, on a stock scaffold that never had a single file hand-edited.

**Cause** — Two independent causes, not one:

(a) Every generated `package.json` is mis-indented against the workspace's own prettier config.
`fsTool.writeJSONFile` hardcodes 2-space JSON —
```ts
await fs.writeFile(destination, JSON.stringify(content, null, 2));
```
(`packages/@repo/lib/src/file-system-module/index.ts:34`) — while the shipped `.prettierrc.cjs`
mandates `useTabs: true`. Every `package.json` the generator writes therefore disagrees with the
formatting rule the generated workspace enforces on itself.

(b) Real source drift in template `src/*.ts` files (e.g. missing trailing commas per
`trailingComma: "all"`) that the master repo's own `format:check` never caught, because it has been
silently skipping those files — see [B36](#b36)'s `requirePragma` masking. A workspace that
actually runs prettier for real (no `requirePragma` override, since it's prettier-only) is the first
place this drift surfaces.

**Fix** — For (a), route `writeJSONFile`'s serialization through the workspace's chosen prettier
options (or, simpler, run the generated tree through `prettier --write` once at the end of `init`,
after all files are on disk, so indentation always matches whatever `.prettierrc.cjs` the workspace
received). For (b), fix [B36](#b36) first so the master repo's `format:check` is a real gate again,
then run `pnpm exec prettier --write` on the 128 drifted files it will newly report and commit the
result.

**Verify**
```bash
# scaffold cli + web-client with formatter = prettier only, then:
pnpm install && pnpm format:check   # must exit 0, not fail on 9/10 packages
```

---

## B42

### B42 · Shared `eslint-config` ignores `**/dist/**` but not `**/bin/**`

- **Status:** open
- **Severity:** P3
- **Area:** `eslint-config`
- **File:** `configs/eslint-config/src/configs/base.ts:15-28`
- **Found while fixing:** [B31](ci-bugs.md#b31)

**Symptom** — Any package that bundles its build output into `bin/` needs its own
`--ignore-pattern` to keep ESLint from linting compiled output, instead of getting it for free from
the shared config the way `**/dist/**` already is. Live today: `apps/startx-cli/package.json`
carries a local workaround on both scripts —
```json
"lint": "eslint . --ignore-pattern 'bin/**'",
"lint:fix": "eslint . src/**/*.ts --fix --ignore-pattern 'bin/**'",
```
— that should be unnecessary once the shared config ignores `**/bin/**` itself.

**Cause** — `configs/eslint-config/src/configs/base.ts:15-28`'s global `ignores` list covers
`**/node_modules/**`, `**/dist/**`, `**/build/**`, `**/.next/**`, plus assorted config filenames,
but has no `**/bin/**` entry, in `base.ts` or in `frontend.ts` (the only other file with an
`ignores` key). [B31](ci-bugs.md#b31) repointed the CLI's own build output to `apps/startx-cli/bin/`
(`tsdown.config.ts`'s `outDir: "bin"`), but nothing updated `base.ts`'s ignore list to match, leaving
the CLI to work around it locally instead of the shared config covering it for everyone.

**Fix** — Add `"**/bin/**"` to the global `ignores` array in `base.ts` (and `frontend.ts` if it
maintains its own build-output convention), then remove the now-redundant
`--ignore-pattern 'bin/**'` from `apps/startx-cli/package.json`'s `lint` and `lint:fix` scripts.

**Verify**
```bash
pnpm exec turbo lint --continue   # still green with the local --ignore-pattern removed from apps/startx-cli/package.json
```
