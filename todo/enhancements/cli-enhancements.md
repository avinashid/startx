# CLI enhancements

Improvements to `apps/startx-cli` — the published product.
Register: [`enhancements.md`](enhancements.md).

Contents: [E1](#e1) · [E3](#e3) · [E4](#e4) · [E5](#e5) · [E6](#e6)

---

## E1

### E1 · Test suite for `startx-cli` — snapshot the emitted tree

- **Status:** open · **Value:** high · **Effort:** M
- **Area:** `apps/startx-cli`

**Today** — `startx-cli` has **zero tests**. `vitest run` reports "No test files found". The only
tested package in the entire repo is `eslint-config` (24 tests, all for its custom rules).

**Why it matters** — Every one of B13–B21 is a defect the CLI cannot detect in itself. The
generator's whole job is "given these inputs, emit this tree", which is the single most
snapshot-testable shape of program there is.

**What to build**

1. **A fixture template.** Don't scaffold from the real repo in tests — it's slow and it couples
   test outcomes to unrelated template edits. Build a small fixture with two apps, two packages and
   one config, exercising every metadata field (`gTags`, `iTags`, `tags`, `mode`, `requiredDeps`,
   `ignore`). Point `CliUtils.getDirectory()` at it via an injectable template root.

2. **Extract the prompt layer.** `init.run()` and `PackageCommand.add()` interleave prompting with
   work. Split each into `resolvePlan(inputs) → Plan` and `applyPlan(plan, destination)`. The plan is
   a plain object — assert on it directly, no pty needed. This also unblocks [E5](#e5).

3. **Tests worth writing first**, each mapping to a known bug:

   | Assertion | Catches |
   |---|---|
   | Emitted tree matches a directory snapshot | B13, B14 |
   | `web-client.scripts.typecheck === "react-router typegen && tsc"` with a backend app selected | B15 |
   | `ui.peerDependencies` and `private: true` survive | B16 |
   | A two-level `requiredDeps` chain resolves fully | B17 |
   | `add @db/x -n @repo/y` lands in `packages/@repo/y` | B19 |
   | Every emitted `workspace:^` dep resolves to a directory that exists | B17, B20 |
   | `pnpm install --frozen-lockfile=false` succeeds in the output | B20 |

4. **One end-to-end test** that runs the real `init` into a temp dir and then runs `pnpm install`
   and `pnpm typecheck` in the result. Slow — mark it and run it in CI only.

**Done when** — `pnpm --filter startx-cli test` runs a meaningful suite, and the fixture snapshot
fails if any of B13–B19 is reintroduced.

---

## E3

### E3 · Integrity check: every `FileCheck` / `DepCheck` key must resolve

- **Status:** open · **Value:** high · **Effort:** S
- **Area:** `apps/startx-cli/src/configs/`

**Today** — `FileCheck` is keyed by filename and `DepCheck` by package name, both as free-text
string literals with nothing checking them. [B13](../bugs/config-bugs.md#b13) is exactly this: the
key `".prettier.cjs"` has been dead for its entire existence because the real file is
`.prettierrc.cjs`, and the failure mode is silent — an unknown filename is copied unconditionally,
so a typo turns a gate into a pass-through.

**Why it matters** — This is a whole class of bug, not one instance. Every future rename of a config
file silently disables its gate.

**What to build**

1. **A test** asserting that every `FileCheck` key exists somewhere in the template — at the root or
   in at least one package directory:

   ```ts
   it("every FileCheck key names a real template file", async () => {
     const roots = await collectTemplateDirs();
     for (const key of Object.keys(FileCheck)) {
       expect(roots.some(d => existsSync(join(d, key))), `FileCheck key "${key}"`).toBe(true);
     }
   });
   ```

2. **The same for `DepCheck`** — every key must be either a real npm package named in some template
   `package.json`, or a workspace package directory that exists.

3. **Invert the default while you're here.** "Unknown filename ⇒ copy unconditionally" is what makes
   a typo invisible. Consider requiring every copied file to be listed, with an explicit
   `{ tags: [] }` (always copy) entry. That turns a silent typo into a loud "unlisted file" error.
   This is a behaviour change — do it behind the tests from [E1](#e1).

**Done when** — Renaming a template config file without updating `FileCheck` fails the test suite.

---

## E4

### E4 · Register packages created outside the workspace globs

- **Status:** open · **Value:** medium · **Effort:** S
- **Area:** `apps/startx-cli/src/commands/package.ts:161-167`

**Today** — `startx package new <name> --dir <path>` writes to any path the user gives, but never
checks whether that path is covered by `pnpm-workspace.yaml`'s `packages:` globs:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "packages/*/*"
  - "configs/*"
```

The documented example `--dir packages/internal/my-utils` happens to match `packages/*/*` and works.
Anything outside those four buckets — `--dir tools/codegen`, `--dir services/billing` — produces a
package directory that pnpm does not link. `pnpm install` then fails to resolve the
`workspace:*` reference, with an error that doesn't mention the glob.

**What to build**

After writing the package, check the destination against the parsed globs (`CliUtils.parsePnpmWorkspace`
already loads them). If it doesn't match, append a covering glob to `pnpm-workspace.yaml` using the
same `YAML.parseDocument` / `setIn` approach `syncDepsWithCatalog` uses, so comments and formatting
survive. Log what was added:

```
+ pnpm-workspace.yaml packages: "tools/*"
```

Prompt before writing if you'd rather not touch their config silently.

**Done when** — `startx package new x --dir tools/x` produces a workspace where `pnpm install`
links the package.

---

## E5

### E5 · Non-interactive mode — a flag for every prompt

- **Status:** open · **Value:** medium · **Effort:** M
- **Area:** `apps/startx-cli/src/commands/`

**Today** — Every command prompts unconditionally. `startx package new @repo/foo` still asks for the
package name with `@repo/foo` merely pre-filled as the default (`package.ts:154`). `init` always asks
for apps, configs, packages and formatter. There is no way to run any of it from a script, a CI job,
a Dockerfile, or a test.

**Why it matters** — It blocks [E1](#e1)'s end-to-end tests, and it blocks any "scaffold from a
saved config" workflow.

**What to build**

1. **Skip prompts whose answer was supplied.** If `packageName` is passed as an argument and it
   validates, don't ask. Same for `--dir`, `--name`, `--eslint`.
2. **Flags for the remaining `init` prompts** — `--apps a,b`, `--configs a,b`, `--packages a,b`,
   `--formatter prettier|prettier+biome`.
3. **A `--yes` / `-y` flag** that accepts every default and fails loudly rather than prompting if a
   required answer is missing.
4. **Detect non-TTY.** When `!process.stdin.isTTY`, refuse to prompt and exit with a clear message
   naming the flag that would have supplied the answer.

Pairs naturally with the `resolvePlan` / `applyPlan` split described in [E1](#e1) — do that
refactor once and both land.

**Done when** — `startx init myapp --apps core-server,web-client --formatter prettier -y` runs to
completion with stdin closed.

---

## E6

### E6 · Typed CLI errors and meaningful exit codes

- **Status:** open · **Value:** low · **Effort:** S
- **Area:** `apps/startx-cli/src/`

**Today** — Failures are bare `throw new Error("...")` (`init.ts:106`, `init.ts:240`, `init.ts:355`,
`package.ts:100`, `package.ts:166`, `package.ts:349`, `package.ts:378`). Commander prints the stack
trace, and every failure exits `1`. A user who aborts at the "directory not empty" prompt gets the
same treatment — and the same stack trace — as a genuine internal error.

**What to build**

1. A `StartXError` class carrying `{ code, hint }`. Print `message` plus `hint` without a stack;
   reserve stack traces for unexpected errors.
2. Distinct exit codes: `0` success · `1` unexpected · `2` invalid usage · `3` user aborted ·
   `4` workspace precondition not met (not a monorepo, missing `pnpm-workspace.yaml`).
3. A top-level handler in `index.ts` — there is currently none, so rejected promises surface as
   `UnhandledPromiseRejection`.

**Done when** — Aborting at a prompt exits `3` with one line and no stack trace.
