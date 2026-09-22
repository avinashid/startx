# CLI features

New capabilities for `apps/startx-cli`.
Register: [`features.md`](features.md).

Contents: [F1](#f1) · [F2](#f2) · [F3](#f3) · [F6](#f6) · [F7](#f7)

---

## F1

### F1 · `startx doctor` — validate an existing workspace

- **Status:** open · **Value:** high · **Effort:** M

**The idea** — A command that inspects the current monorepo and reports everything structurally
wrong with it, with a `--fix` flag for the mechanical cases.

```bash
startx doctor
startx doctor --fix
```

**Why** — Most of the P1/P2 bugs in this repo are conditions a validator would catch immediately.
Running `startx doctor` against **this very repository** should report B8, B9, B10 and B11 today.
That makes it both a user-facing feature and a regression harness for the generator.

**Checks to implement**, roughly in value order:

| Check | Catches |
|---|---|
| Every workspace package has a `tsconfig.json` if it declares a `typecheck` script | [B9](../bugs/config-bugs.md#b9) |
| Every `workspace:*` / `workspace:^` dep resolves to a real package directory | [B17](../bugs/function-bugs.md#b17) |
| Every `catalog:` dep has an entry in `pnpm-workspace.yaml` | [B20](../bugs/function-bugs.md#b20) |
| Every package directory is covered by a `packages:` glob | [E4](../enhancements/cli-enhancements.md#e4) |
| Every package with an `eslint.config.*` lints at least one file | [B8](../bugs/config-bugs.md#b8) |
| Frontend packages use the `react-router typegen` typecheck script | [B15](../bugs/function-bugs.md#b15) |
| `vitest` present but `passWithNoTests` unset on a package with no tests | [B11](../bugs/config-bugs.md#b11) |
| Package `name` scope matches its directory scope | [B19](../bugs/function-bugs.md#b19) |
| Every var in `.env.example` satisfies the schemas that consume it | [B7](../bugs/config-bugs.md#b7) |
| `packageManager` version matches `Constants.packageManager` | — |

**Output** — One line per finding, grouped by severity, with the file path and a one-line fix. Exit
`0` when clean, `1` when anything is found, so it can gate CI.

**`--fix`** — Only the unambiguous repairs: adding a missing `tsconfig.json`, appending a missing
catalog entry, adding a missing workspace glob. Never touch source files.

**Reuse** — `CliUtils.parsePnpmWorkspace` and `CliUtils.getPackageList` already do most of the
loading; `getPackageList` needs a variant that scans the *user's* workspace rather than the template.

---

## F2

### F2 · Generate a real `.env` during `init`

- **Status:** open · **Value:** high · **Effort:** S

**The idea** — At the end of `init`, write a `.env` for the scaffolded project with real random
secrets, so it boots without hand-editing.

**Why** — Today the first-run path is broken: `.env.example` ships 24-character placeholder secrets,
and `@repo/lib`'s token module requires 32 ([B7](../bugs/config-bugs.md#b7)). A user copies the
example, starts the server, and gets a Zod validation failure before anything listens.

**What to build**

1. Collect the env requirements from the **selected** packages only — a workspace with no Redis
   package shouldn't get `REDIS_*` keys. This needs each template to declare its env surface;
   simplest is a `startx.env` array in its `package.json`, next to the existing metadata.
2. Generate values for the ones that can be generated:
   ```
   ACCESS_TOKEN_SECRET        = <crypto.randomBytes(32).toString("hex")>
   REFRESH_TOKEN_SECRET       = <crypto.randomBytes(32).toString("hex")>
   INTEGRATION_ENCRYPTION_KEY = <crypto.randomBytes(32).toString("hex")>   # must be 64 hex chars
   ```
3. Leave the rest as commented placeholders with a one-line description each.
4. Write both `.env` and `.env.example` — `.env` is already in `_gitignore`, so it won't be committed.
5. Print a reminder that `.env` contains generated secrets and is git-ignored.

**Careful** — `EncryptionModule` requires exactly 64 hex characters
(`encryption-module/index.ts:6`), i.e. 32 bytes. The token secrets only need ≥32 characters. Don't
conflate the two.

**Done when** — `startx init` → `pnpm install` → `pnpm dev` boots with no manual editing.

---

## F3

### F3 · `startx package remove`

- **Status:** open · **Value:** medium · **Effort:** M

**The idea** — The inverse of `package add`.

```bash
startx package remove @repo/mail
startx package remove @repo/mail --dry-run
```

**Why** — `add` is easy to run speculatively, and there is currently no clean way back. Manual
removal means deleting the directory, then hunting for references in every other `package.json`,
then deciding which catalog entries are now orphaned.

**What to build**

1. Refuse if another workspace package still depends on it, listing the dependents. `--force` to
   override.
2. Delete the package directory (confirm first; show the path).
3. Strip the `workspace:*` reference from every other package's `dependencies` / `devDependencies`.
4. Report — but by default do **not** remove — now-orphaned `pnpm-workspace.yaml` catalog entries.
   Catalog entries are cheap and removing them is the risky part. `--prune-catalog` to opt in.
5. `--dry-run` printing the full plan and changing nothing. Make this the shape of the command from
   the start; it's also how it gets tested.

**Done when** — `add` followed by `remove` returns the workspace to its prior state, verifiable with
`git diff`.

---

## F6

### F6 · `startx update` — refresh templates in an existing workspace

- **Status:** open · **Value:** medium · **Effort:** L

**The idea** — Pull improvements from a newer `startx` into a workspace that was scaffolded from an
older one.

```bash
startx update            # show what changed
startx update @repo/lib  # update one package
```

**Why** — Every fix in this folder — B1, B3, B6, B22–B28 — currently only benefits *new* projects.
Existing ones have no upgrade path at all. As the security fixes land, that gap becomes the main
reason someone would want this.

**Why it's hard** — Users edit generated code; that's the point. Any update has to distinguish
"upstream changed this" from "the user changed this", and the CLI keeps no record of what it
originally emitted.

**What it needs first**

1. **Provenance.** Record, at generation time, the template version and a content hash per emitted
   file — a `.startx/manifest.json` in the generated workspace.
2. **Three-way merge.** With original, current and new versions, classify each file: unchanged
   upstream (skip), unchanged locally (overwrite), changed on both sides (conflict). Write conflicts
   as `.orig`/`.new` pairs rather than attempting a textual merge.
3. **A dry-run report by default.** Never write without `--apply`.

**Do not start this** until [E1](../enhancements/cli-enhancements.md#e1) exists. An update command
built on a generator with no tests will corrupt people's working repositories.

---

## F7

### F7 · `git init` and optional `pnpm install` after `init`

- **Status:** open · **Value:** medium · **Effort:** S

**The idea** — Finish the job. After writing the tree, offer to initialise git and install
dependencies.

**Why** — `init` currently stops at "files written" and tells the user to run `pnpm install`
themselves. Meanwhile `package add` already shells out to the package manager
(`installRootDependencies`, `package.ts:596`), so the capability exists — it's just not wired into
`init`. The inconsistency is the real problem: one command installs, the other doesn't.

**What to build**

1. `git init`, write the `.gitignore` (already copied from `_gitignore`), `git add -A`, and an
   initial commit — `chore: scaffold with startx v<version>`. Skip silently if the target is already
   inside a git work tree.
2. Prompt to run `pnpm install`, defaulting to yes. Honour `--no-install`, which `package add`
   already defines, so the flag means the same thing in both commands.
3. Reuse `installRootDependencies` rather than adding a second spawn path — and fix
   [B21](../bugs/function-bugs.md#b21) while you're in there, since its hardcoded "to install
   ESLint..." message would be visible on this path.
4. On success, print the real next steps: `cd <dir>`, `pnpm dev`, and where the generated `.env`
   lives (see [F2](#f2)).

**Done when** — `startx init myapp` yields a git repo with one commit and a populated
`node_modules`, or explains exactly why it didn't.
