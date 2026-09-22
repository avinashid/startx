# todo/ — startx working documentation

This folder is the single place where startx's **architecture**, **known defects**, and
**planned work** are written down. Nothing here is generated; everything is hand-maintained
and reviewed alongside code changes.

```
todo/
├── README.md              ← you are here: what startx is, how it works, how this folder works
├── bugs/                  ← defect register — capture → triage → fix → verify
│   ├── bugs.md            ←   ROOT register. Every bug appears here exactly once.
│   ├── function-bugs.md   ←   defects in executable logic
│   ├── runtime-bugs.md    ←   defects that only surface when a generated app runs
│   ├── type-bugs.md       ←   TypeScript compile errors
│   ├── config-bugs.md     ←   wrong config files and static data tables
│   ├── security-bugs.md   ←   defects with a security impact
│   └── ci-bugs.md         ←   pipeline / packaging defects
├── enhancements/          ← improve something that already exists
│   ├── enhancements.md    ←   ROOT register
│   ├── cli-enhancements.md
│   └── template-enhancements.md
├── features/              ← build something that does not exist yet
│   ├── features.md        ←   ROOT register
│   ├── cli-features.md
│   └── template-features.md
└── chores/
    └── chores.md          ← repo hygiene, docs, tooling, dependency maintenance
```

**The rule:** every item has an ID, lives in exactly one detail file, and is listed once in
its category's root register. The register carries the authoritative status; the detail file
carries the evidence and the fix. See [How to work this folder](#6-how-to-work-this-folder).

---

## 1. What startx is

A CLI that scaffolds a production-ready TypeScript monorepo. This repository is **both the
tool and the template** — `startx init` reads the very `apps/`, `packages/` and `configs/`
directories you are looking at and copies a selected subset of them into a new workspace.

- Published as [`startx`](https://www.npmjs.com/package/startx) on npm (`bin` → `apps/startx-cli/dist/index.mjs`).
- pnpm workspaces + Turborepo, Node ≥ 22, pnpm 11.5.1, MIT.

```bash
npx startx init                 # scaffold a new monorepo, interactively
startx package list             # show every template app/package/config
startx package add core-server  # copy a template into an existing monorepo
startx package new @repo/utils  # create a blank workspace package
```

### Repository layout

| Path | Role |
|---|---|
| `apps/startx-cli/` | **The product.** Commander CLI, bundled by tsdown into a single `.mjs`. |
| `apps/core-server/` | Template: Express REST API |
| `apps/web-client/` | Template: React Router v7 SPA |
| `apps/cli/` | Template: Commander CLI app |
| `apps/queue-worker/` | Template: BullMQ background worker |
| `packages/@repo/{env,lib,logger,mail,model,redis}` | Template shared libraries (backend) |
| `packages/@db/{drizzle,sqlite}` | Template database layers |
| `packages/{ui,queue,aix,common}` | Template shared libraries (ui / node) |
| `configs/{typescript,eslint,vitest,tsdown}-config` | Template shared configs |
| `startx.json` | Extra root deps merged into a generated workspace's root `package.json` |
| `pnpm-workspace.yaml` | Workspace globs + the **catalog** every template dep resolves through |

---

## 2. The orchestration model

Everything the CLI does is driven by a `startx` block inside each template `package.json`.
There is no separate manifest — the templates describe themselves.

```jsonc
// apps/core-server/package.json
"startx": {
  "gTags": ["node", "backend"],        // broadcast to the WHOLE generated workspace
  "tags": ["express"],                 // this package's OWN tags, not broadcast
  "requiredDeps":    ["@repo/env", "@repo/logger", "@repo/lib"],
  "requiredDevDeps": ["typescript-config", "tsdown-config"]
}
```

### 2.1 The five metadata fields

| Field | Direction | Meaning |
|---|---|---|
| `gTags` | **out** | Tags this package broadcasts globally once selected. Selecting `core-server` makes `node` and `backend` true for every other package in the workspace. |
| `iTags` | **in** | Install gate. The package is only *offered* when `iTags ⊆ globalTags`. `ui` has `iTags: ["react","frontend"]`, so it only appears if a frontend app was picked. |
| `tags` | **local** | The package's own identity tags. **Not** broadcast. `web-client` owns `react-router`; `core-server` owns `express`. |
| `mode` | — | `silent` = never shown in prompts (`startx-cli`, `tsdown-config`). `standalone` = treated as runnable even though it lives in `packages/`. |
| `requiredDeps` / `requiredDevDeps` | **out** | Workspace packages that must come along. Re-emitted as `workspace:^`. |
| `ignore` | **out** | Names to strip from the emitted `package.json`, and a way to opt out of `eslint`/`vitest` file generation. |

**The tag set for a given package** is `globalTags ∪ package.startx.tags`, minus anything its
`ignore` list opts out of. That set then drives three lookup tables:

| Table | File | Decides |
|---|---|---|
| `FileCheck` | `apps/startx-cli/src/configs/files.ts` | which top-level files get copied |
| `DepCheck` | `apps/startx-cli/src/configs/deps.ts` | which dependencies get written / installed |
| `scripts` | `apps/startx-cli/src/configs/scripts.ts` | which npm scripts get written |

All three use the same predicate: an entry applies when **`entry.tags ⊆ currentTags`**.

- `FileCheck`: a filename **not** in the table is copied **unconditionally**. The pseudo-tag
  `never` is in no tag set, so it means "never copy".
- `scripts`: each script name maps to an **ordered array**; the **first** matching entry wins.
  Order therefore encodes priority — and getting it wrong is [B15](bugs/function-bugs.md#b15).

### 2.2 `startx init` — step by step

`apps/startx-cli/src/commands/init.ts:24`

1. **Discover templates** — `CliUtils.getPackageList()` (`utils/cli-utils.ts:39`) scans
   `apps/`, `configs/`, `packages/` (minus the `@repo`/`@db` dirs), then `packages/@repo/` and
   `packages/@db/` with a name prefix. The template root is derived from `import.meta.url`:
   `../../../` in production, `../../../../` when `STARTX_ENV=development` (`cli-utils.ts:24`).
2. **Project prefs** — `getPrefs()`: prompt for an npm-valid project name; target dir is
   `--dir` or `cwd/<projectName>`; checkbox of apps where `mode !== "silent"`.
3. **Guard the target dir** — `checkTargetDirectory()` confirms if the directory is non-empty.
4. **Resolve configs** — `getConfigPrefs()`: seed `gTags` with `common`; absorb the selected
   apps' `gTags`; pull in their `requiredDeps`; offer remaining configs whose `iTags ⊆ gTags`;
   prompt for the formatter (`prettier` or `prettier + biome`); re-resolve; absorb config `gTags`.
5. **Resolve packages** — `getPackagesPrefs()`: offer packages whose `iTags ⊆ gTags`, pull in
   their `requiredDeps`, absorb their `gTags`.
6. **Write the workspace root** — `installWorkspace()`: merge root `package.json` with
   `startx.json`, run it through `FileHandler.handlePackageJson` with tags `["root", …gTags, "runnable"]`,
   copy root-level whitelisted files (`_gitignore` → `.gitignore`), write `.vscode/settings.json`
   and `.vscode/extensions.json` matching the chosen formatter.
7. **Write every package** — `installPackage()` per selection, in parallel: build the tag set,
   emit `package.json`, copy whitelisted top-level files, then `copyDirectory` of `src/`
   (excluding `*.test.ts(x)` when `vitest` is not in the tag set).

No install is run. The user finishes with `pnpm install`.

### 2.3 `FileHandler.handlePackageJson` — how a package.json is rewritten

`apps/startx-cli/src/utils/file-handler.ts:23`

1. `isWorkspace = tags.includes("root")` — root gets `version`, `packageManager`, `engines`.
2. **Scripts** — for each script name, the first `scripts[name]` entry whose tags are satisfied.
3. **Deps** — keep any dep *absent* from `DepCheck`, plus any whose `DepCheck.tags` are satisfied.
4. **Strip** every `workspace:` dep, then **re-add** `requiredDeps`/`requiredDevDeps` as `workspace:^`.
   (This is why a workspace dep that isn't declared in `requiredDeps` silently disappears.)
5. **Add** remaining matching `DepCheck` entries (root-only entries gated on `isWorkspace`).
6. **Delete** everything named in `startx.ignore`.
7. Assemble from a fixed field whitelist and sort. The whitelist is currently lossy — [B16](bugs/function-bugs.md#b16).

### 2.4 `startx package add` — differences from `init`

`apps/startx-cli/src/commands/package.ts:86`

- Reads the **user's** workspace to decide tags: `getInstallTags()` detects biome / prettier /
  vitest / tsdown / eslint from their root `package.json` rather than prompting.
- `resolvePackageClosure()` (`package.ts:292`) does a proper **BFS** over `requiredDeps` — unlike
  `init`, which only goes one level deep ([B17](bugs/function-bugs.md#b17)).
- `checkAndInstallMissingDeps()` diffs `DepCheck` against the user's root `package.json` and the
  pnpm catalog; missing npm deps are offered for install, missing **workspace** deps are reported
  as `run: startx package add <name>`.
- `syncDepsWithCatalog()` rewrites pinned versions to `catalog:` and appends the real versions to
  the user's `pnpm-workspace.yaml` catalog.
- Prompts before overwriting an existing destination.

### 2.5 `startx package new`

`apps/startx-cli/src/commands/package.ts:153` — creates a blank package: `package.json`,
`src/index.ts`, `tsconfig.json`, plus `eslint.config.ts` / `vitest.config.ts` only when those
tools are detected in the workspace root. Ensures `typescript-config` (and `eslint-config` /
`vitest-config` as needed) exist first.

### 2.6 Turborepo task graph

`turbo.json`:

```
lint      → (leaf)
build     → dependsOn ["lint", "^build"]
typecheck → dependsOn ["^typecheck", "build"]
test      → (leaf)
```

Consequence worth knowing: **`pnpm typecheck` transitively runs `lint` and a full `build`**.
One package with a broken lint config fails the entire root task — see [B8](bugs/config-bugs.md#b8).

### 2.7 Release pipeline

`.github/workflows/publish.yml`, on every push to `main`: checkout → Node 22 → corepack →
`pnpm install --frozen-lockfile` → `pnpm --filter startx-cli build` → a `node -e` script that
**deletes `dependencies` and `devDependencies`** from the root `package.json` (the CLI bundle is
self-contained; `startx.json` preserves the real lists for the generator) → `pnpm publish --no-git-checks`.

There is no test, lint, typecheck or version-change gate on this — [B30](bugs/ci-bugs.md#b30).

---

## 3. Current health

Last full run: **2026-09-22**, HEAD `dcb2bb1`.

| Command | Result |
|---|---|
| `turbo typecheck --continue` | **9 of 41 tasks fail** |
| `turbo lint --continue` | **1 task fails**, ~90 warnings |
| `turbo test --continue` | **1 of 8 fails**; 24 tests total, all in `eslint-config` |

Packages reporting "No test files found": `core-server`, `queue-worker`, `cli`, `startx-cli`,
`@repo/model`, `ui`. **`startx-cli` — the published product — has zero tests.**

Re-run the health check with:

```bash
pnpm exec turbo typecheck --continue
pnpm exec turbo lint --continue
pnpm exec turbo test --continue
```

---

## 4. Where the bodies are buried

Short orientation for anyone touching the generator. Each of these is a real, filed defect.

| Area | Gotcha |
|---|---|
| `scripts.ts` | First-match-wins over an ordered array. `node` is a *global* tag, so a backend app in the same workspace can steal the frontend's script. [B15] |
| `file-handler.ts` | Output `package.json` is a fixed field whitelist — `private`, `bin`, `main`, `peerDependencies` are dropped. [B16] |
| `files.ts` | Unlisted filenames copy **unconditionally**. One filename is misspelled, one is gated on the wrong tag. [B13] [B14] |
| `init.ts` vs `package.ts` | Two different dependency-closure implementations; only one is correct. [B17] |
| `@repo/env` | `defineEnv` **deletes** keys from `process.env`, including `NODE_ENV`. [B2] |
| `@repo/redis` | `RedisStore.set` TTL is in **seconds**; one caller passes milliseconds. [B3] |
| `core-server` | The error middleware has arity 3, so Express never treats it as an error handler. [B1] |

---

## 5. Item IDs

| Prefix | Category | Register |
|---|---|---|
| `B<n>` | Bug | [`bugs/bugs.md`](bugs/bugs.md) |
| `E<n>` | Enhancement | [`enhancements/enhancements.md`](enhancements/enhancements.md) |
| `F<n>` | Feature | [`features/features.md`](features/features.md) |
| `C<n>` | Chore | [`chores/chores.md`](chores/chores.md) |

IDs are **permanent**. Never renumber, never reuse — a fixed item keeps its ID with status
`fixed`. Sub-items use a dot (`B12.1`) when one investigation yields several separable defects.

**Statuses:** `open` · `in-progress` · `fixed` · `verified` · `wontfix` · `invalid`

`fixed` means the code changed. `verified` means the **Verify** command in the detail entry was
run and passed. Only move to `verified` after actually running it.

---

## 6. How to work this folder

**Capturing a new bug**

1. Take the next free `B<n>` from `bugs/bugs.md`.
2. Add one row to the register table in `bugs/bugs.md`.
3. Add the full entry to the matching detail file, using the entry template below.
4. If it belongs to two categories, pick one home and cross-reference from the other.

**Resolving a bug**

1. Set status `in-progress` in `bugs/bugs.md`.
2. Fix it. Reference the ID in the commit subject: `fix(core-server): error middleware arity (B1)`.
3. Run the entry's **Verify** command.
4. Set status `verified` in the register and fill in **Fixed in** with the commit SHA.

**Entry template** — every detail entry uses these fields, in this order:

```markdown
### B<n> · <one-line title>

- **Status:** open
- **Severity:** P0 | P1 | P2 | P3
- **Area:** <package or app>
- **File:** `path/to/file.ts:LINE`
- **Fixed in:** —

**Symptom** — what a user observes.
**Cause** — the mechanism, with the offending code quoted.
**Fix** — the concrete change to make.
**Verify** — a command or assertion that proves it.
```

**Severity scale**

| | Meaning |
|---|---|
| **P0** | Generated output is broken or a security weakness is live. Fix before shipping anything else. |
| **P1** | Toolchain is broken — lint / typecheck / test / build fails, so CI signal is worthless. |
| **P2** | The generator silently emits degraded output. Users hit it without knowing. |
| **P3** | Hardening, papercuts, dead code. |

---

## 7. Suggested order of work

1. **B1–B7** — the generated backend is either non-compiling or wrong at runtime; B3 is a live
   auth weakness.
2. **B8–B12** — get lint / typecheck / test green so CI means something.
3. **B30** — gate publishing on a green build and a version change before shipping anything else.
4. **B13–B21** — generator defects; each one silently degrades *every* repo scaffolded from here.
5. **B22–B29** — server hardening defaults.
6. **E1** — tests for `startx-cli`. Snapshotting the emitted tree would have caught most of B13–B21.
