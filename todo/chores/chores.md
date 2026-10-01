# Chore register — ROOT

Repo hygiene, docs and maintenance. No user-visible behaviour change.
Not bugs, not features — just things that should be tidy and currently aren't.

- **Next free ID:** `C9`
- **Open:** 8 · **In progress:** 0 · **Done:** 0

Conventions and the entry template are in [`../README.md`](../README.md#6-how-to-work-this-folder).

| ID | Title | Effort | Status |
|---|---|---|---|
| [C1](#c1) | `CONTRIBUTING.md` + issue and PR templates | S | open |
| [C2](#c2) | `CHANGELOG.md` and a written release process | S | open |
| [C3](#c3) | Pin the Node version consistently | S | open |
| [C4](#c4) | Catalog freshness pass | M | open |
| [C5](#c5) | Fill in the root `package.json` metadata | S | open |
| [C6](#c6) | `README.md` is out of date with `c104915` — `--force` and `.prettierrc.mjs` | S | open |
| [C7](#c7) | web-client `vite.config.ts` start-up noise: `☠ MISSING_ENV_FILE`, deprecated `envFile`, `__dirname` | S | open |
| [C8](#c8) | cli template: the `test` command's description is stale | S | open |

---

## C1

### C1 · `CONTRIBUTING.md` + issue and PR templates

- **Status:** open · **Effort:** S

`.github/` contains exactly one file — `workflows/publish.yml`. There is no `CONTRIBUTING.md`, no
issue templates, no PR template, and no `CODE_OF_CONDUCT.md`. For a published npm package with a
public repo, that means every drive-by contributor has to infer the conventions.

**What to write**

- `CONTRIBUTING.md` covering: the pnpm/turbo setup, how to run the CLI locally
  (`STARTX_ENV=development` changes how the template root is resolved —
  `cli-utils.ts:24`, and that is genuinely non-obvious), how to add a template package including the
  `startx` metadata block, and the commit convention.
- A PR template with a checklist: lint/typecheck/test run, `todo/` entry referenced by ID, template
  changes scaffolded and verified.
- A bug issue template asking for the `startx --version`, the selections made, and the emitted tree.

**Reference the ID convention** from [`../README.md`](../README.md#5-item-ids) so contributors file
into this folder rather than opening parallel tracking elsewhere.

---

## C2

### C2 · `CHANGELOG.md` and a written release process

- **Status:** open · **Effort:** S

There is no changelog. The published version is `1.1.60`, and the only record of what changed
between releases is the git log — which is mostly terse subjects like `updated repo lib`,
`updated scripts`, `bump package version`. There is no way for a user on `1.1.40` to know whether
upgrading fixes their problem.

**What to write**

1. A `CHANGELOG.md` in Keep-a-Changelog format. Don't attempt to reconstruct history — start at the
   next release with an `## [Unreleased]` section.
2. A short "Releasing" section in `CONTRIBUTING.md`: bump the version, update the changelog, tag,
   push. Pair this with [B30](../bugs/ci-bugs.md#b30)'s fix — if publishing moves to a tag trigger,
   the process needs documenting anyway.
3. Consider Changesets. For a single published package it's arguably overkill, but it would enforce
   that every PR states its user-visible effect.

**Also worth fixing here:** commit subjects. `fixed bugs related to deps check, and some enhancements`
tells a future reader nothing. Once IDs exist, `fix(cli): gate .prettierignore on prettier tag (B14)`
is both shorter and useful.

---

## C3

### C3 · Pin the Node version consistently

- **Status:** open · **Effort:** S

Three different statements about the required Node version, none of them enforced locally:

| Source | Value |
|---|---|
| `package.json` `engines.node` | `>=22` |
| `apps/startx-cli/src/constants.ts` `Constants.node` | `>=22` (written into generated workspaces) |
| `.github/workflows/publish.yml` | `node-version: 22` |
| Actual local toolchain | Node 26.7.0 |

There is no `.nvmrc` and no `.node-version`, so contributors land on whatever they have. The repo
currently builds on Node 26 despite everything declaring 22 — fine, but unverified.

**What to do**

- Add `.nvmrc` with the version the project is actually developed against.
- Decide whether `>=22` is a real floor and test it, or raise it. An `engines` field nobody verifies
  is decoration.
- Add `"engine-strict=true"` to `.npmrc` (currently an empty file) so the constraint is enforced
  rather than advisory.
- Keep `Constants.node` in sync with `engines.node` — they're duplicated with no link between them.
  A test asserting they match is two lines.

---

## C4

### C4 · Catalog freshness pass

- **Status:** open · **Effort:** M

`pnpm-workspace.yaml` is 178 lines and holds the pinned version of **every** dependency any template
can use. It is the single most load-bearing file in the repo: every scaffolded project inherits these
pins, so a stale entry propagates to every new project indefinitely.

Nothing currently keeps it fresh. There is no Renovate or Dependabot config, and no scheduled audit.

**What to do**

1. Run `pnpm outdated -r` and triage. Expect the frontend stack (React 19, React Router 7, Tailwind 4)
   to move fastest.
2. Add Renovate or Dependabot scoped to `pnpm-workspace.yaml`, grouped by ecosystem so it doesn't
   generate 40 PRs. Group at minimum: react/react-dom/react-router, eslint + plugins, everything
   `@aws-sdk/*`.
3. Run `pnpm audit` and record the result. `@repo/lib` pulls in `firebase-admin`, `@aws-sdk/client-s3`
   and `sharp` — a large transitive surface for a template most projects won't fully use.
4. Consider whether `@repo/lib` should be split. It currently bundles auth, mail, storage, S3,
   push notifications, hashing, encryption, sessions, cookies, events and pagination behind one
   package, so taking a dependency on any of it means installing all of it.

Point 4 is arguably an enhancement rather than a chore — promote it to an `E` if you decide to act
on it.

---

## C5

### C5 · Fill in the root `package.json` metadata

- **Status:** open · **Effort:** S

The npm page for `startx` shows no description, because the field is empty:

```json
{
  "name": "startx",
  "description": "",          // ← empty
  "version": "1.1.60",
  ...
}
```

Also missing: `homepage`, `bugs`, and any `files` allowlist (see
[B31](../bugs/ci-bugs.md#b31)). The `README.md` has a perfectly good one-liner already —
*"Scaffold a production-ready TypeScript monorepo in minutes."*

**What to add**

```json
"description": "Scaffold a production-ready TypeScript monorepo in minutes.",
"homepage": "https://github.com/avinashid/startx#readme",
"bugs": { "url": "https://github.com/avinashid/startx/issues" },
```

The `keywords` array (`startx`, `turborepo`, `scaffold`, `express`) is thin for discoverability —
worth adding `monorepo`, `pnpm`, `typescript`, `boilerplate`, `react-router`, `drizzle`.

Note `apps/startx-cli/package.json` also has `"author": ""`, `"license": "ISC"` and
`"main": "index.js"` pointing at a file that doesn't exist. That package is private and never
published, so none of it reaches users — but it's inconsistent with the root's `MIT` and worth
tidying in the same pass.

> **Partly done in `c104915`.** The `files` allowlist landed with [B31](../bugs/ci-bugs.md#b31),
> and the dangling `"main": "index.js"` was deleted from both `apps/cli/package.json` and
> `apps/startx-cli/package.json` with [B16](../bugs/function-bugs.md#b16). Still outstanding:
> `description` is still `""`, `homepage` and `bugs` are still absent, `keywords` is still the
> original four, and `apps/startx-cli` still has `"author": ""` / `"license": "ISC"`.

---

## C6

### C6 · `README.md` is out of date with `c104915` — `--force` and `.prettierrc.mjs`

- **Status:** open · **Effort:** S

`c104915` added a destructive CLI flag and a second Prettier config file. Neither reached the
README, which is the only documentation a user of the published package ever sees.

**`startx init --force` is undocumented.** The README's `init` section has a dedicated **Options**
table (`README.md:40-42`) that lists exactly one flag:

```
| `-d, --dir <path>` | Output directory (defaults to `./<projectName>`) |
```

`-f, --force` is missing from it. That is the flag that lets `init` clear a non-empty target
directory — the single most destructive thing the CLI can do. It is guarded (see
[B17](../bugs/function-bugs.md#b17)), but a guard is not a substitute for telling people it exists.

**`.prettierrc.mjs` is undocumented.** The "What Gets Generated" table lists `.prettierrc.cjs`
(`README.md:202`) but never mentions `.prettierrc.mjs`, even though it is a real generated file
whenever both `prettier` and `biome` are selected, and it *changes formatting behaviour* rather
than just adding to it — it carries a `requirePragma` override. A user who finds an unexplained
second config file in their workspace, and then finds that `format` appears to do nothing, has no
documentation to resolve it. See [B36](../bugs/config-bugs.md#b36), which is the same override
misfiring inside this repo.

**What to do** — Add `-f, --force` to the Options table, add `.prettierrc.mjs` to the generated-files
table with a one-line note on when it appears and what `requirePragma` means, and make a habit of
treating the README's two tables as part of the definition of done for any flag or template-file
change.

---

## C7

### C7 · web-client `vite.config.ts` start-up noise: `☠ MISSING_ENV_FILE`, deprecated `envFile`, `__dirname`

- **Status:** open · **Effort:** S

Every `vite preview` / `react-router build` of web-client prints `☠ [MISSING_ENV_FILE] missing file (<root>/.env)` from dotenvx (the `@repo/env` loader passes `ignore: ["MISSING_ENV_FILE"]`; vite.config doesn't), `The envFile option is deprecated, please use envDir: false instead` (twice), and a warning that `__dirname` (`vite.config.ts:28`) is unsupported by Vite's upcoming native config loader. None of these is broken, but a fresh scaffold should start quietly. Found in: runtime smoke `tsk_jv5m7m9a`, 2026-10-01.

**What to do** — Ignore `MISSING_ENV_FILE` in vite.config's dotenvx call, switch to `envDir: false`, and use `import.meta.dirname`.


---

## C8

### C8 · cli template: the `test` command's description is stale

- **Status:** open · **Effort:** S

`cli --help` describes `test` as "Test semantic routing and parallel SQL generation", but the command only logs `Test command`. Found in: runtime smoke `tsk_jv5m7m9a`, 2026-10-01.

**What to do** — Make the description match the command, or drop the command.

