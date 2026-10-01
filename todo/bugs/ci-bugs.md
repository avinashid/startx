# CI and packaging bugs

Defects in the release pipeline and in what actually ends up in the published tarball.
Register: [`bugs.md`](bugs.md).

Contents: [B30](#b30) · [B31](#b31)

---

## B30

### B30 · CI publishes to npm on every push to `main` with no gate

- **Status:** verified
- **Severity:** P3
- **Area:** ci
- **File:** `.github/workflows/publish.yml`
- **Fixed in:** `c104915`

> **Resolved, and the shipped pipeline goes well beyond the three-item Fix.** `publish.yml` is now
> two jobs. `verify` runs `lint`, `build`, `typecheck`, `test` on **every** push to `main` (not just
> version-bump pushes), then uploads the built `apps/startx-cli/bin/` as an artifact. `publish` needs
> `verify`, only runs `if: github.ref == 'refs/heads/main'`, and downloads that same artifact rather
> than rebuilding — what ships is byte-for-byte what `verify` passed.
>
> The entry's item 2 proposed either a tag trigger or a simple `npm view <pkg> version` string
> compare. Neither shipped as written: the trigger is still a push to `main` (plus `workflow_dispatch`
> added), and the version check instead calls `npm view <pkg> versions --json` (the full published
> list, not just the latest) and corroborates an `E404` with a separate `npm ping` before treating it
> as "never published" — a bare compare would treat a registry outage that returns 404 the same as a
> genuine first release.
>
> Two gates exist that the entry never asked for: a "Verify tarball contents" step that packs the
> real tarball and checks it against `FileCheck` from `apps/startx-cli/src/configs/files.ts` (bin
> target present, every non-`never`-tagged root file present, every template dir has a
> `package.json`, a 300-file floor, and a forbidden-pattern denylist for `node_modules`/`.env`/
> `*.pem`/`dist`/etc.), and a "Smoke test packed CLI" step that installs the real tarball and runs
> `startx --version` and `startx package list` against it. Item 3 (tag + release) shipped as
> proposed, plus idempotent re-tagging logic for a run that published but failed before tagging.

**Symptom** — Two failure modes, both live today:

1. **Every push that doesn't bump `version` fails the workflow.** `pnpm publish` rejects a version
   that already exists on the registry, so routine commits produce a red pipeline that everyone
   learns to ignore.
2. **Every push that does bump `version` ships immediately, unverified.** Nothing runs the tests,
   the linter or the typechecker first — and given that 9 of 41 typecheck tasks currently fail, a
   broken `startx` could be published right now.

There is also no git tag and no GitHub release, so there is no way to map a published version back
to a commit.

**Cause** — The workflow is a straight line with no conditions:

```yaml
on:
  push:
    branches: [main]
jobs:
  publish:
    steps:
      - checkout / setup-node 22 / corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter startx-cli build        # the only check of any kind
      - run: node -e "...delete pkg.dependencies; delete pkg.devDependencies..."
      - run: pnpm publish --no-git-checks
```

The `build` step does exercise `lint` transitively for `startx-cli` only, via
`turbo.json`'s `build.dependsOn: ["lint"]`. Nothing else is checked, and `--no-git-checks` disables
pnpm's own safety rails.

Note the package.json rewrite step is **correct and deliberate**, not a bug: the CLI bundle is
self-contained, and `startx.json` preserves the real dependency lists that the generator copies into
scaffolded workspaces. Keep it, but comment it — it looks alarming without that context.

**Fix** — Three changes, in order of value:

1. **Gate on a green build.** Add `pnpm typecheck`, `pnpm lint` and `pnpm test` as steps before
   publish. This is blocked until the P1 toolchain bugs ([B8–B12](bugs.md)) are fixed — until then
   the pipeline would never go green. Do those first.

2. **Only publish when the version actually changed.** Either trigger on tags instead of pushes:
   ```yaml
   on:
     push:
       tags: ["v*"]
   ```
   or keep the push trigger and guard the publish step:
   ```yaml
   - id: check
     run: |
       LOCAL=$(node -p "require('./package.json').version")
       REMOTE=$(npm view startx version 2>/dev/null || echo "none")
       echo "changed=$([ "$LOCAL" != "$REMOTE" ] && echo true || echo false)" >> "$GITHUB_OUTPUT"
   - if: steps.check.outputs.changed == 'true'
     run: pnpm publish --no-git-checks
   ```
   The tag trigger is preferable — it makes releasing an explicit act.

3. **Tag and release.** On a successful publish, push `v<version>` and create a GitHub release. Pair
   this with the CHANGELOG in [C2](../chores/chores.md#c2).

Consider also adding a separate `ci.yml` that runs lint/typecheck/test on pull requests, so the
signal exists independently of releasing.

**Verify** — Push a commit to `main` with no version change: the workflow must succeed and skip
publishing. Push a version bump: it must run the full check suite before publishing.

---

## B31

### B31 · `.npmignore` excludes the `bin` target; publishing works only by npm's force-include

- **Status:** verified
- **Severity:** P3
- **Area:** ci / packaging
- **File:** `.npmignore:30`, `package.json:10`
- **Fixed in:** `c104915`

> **Resolved as proposed, plus a step the Fix section didn't anticipate.** `.npmignore` is deleted
> and `package.json:10` now carries a `files` allowlist (`apps/`, `configs/`, `packages/`, plus
> negations and a short list of root dotfiles). But an allowlist alone would not have fixed this: the
> CLI build output stayed at `apps/startx-cli/dist/`, which the negation `!**/dist/` now explicitly
> excludes, so the same accidental force-include this entry warned about would just have recurred
> under a different mechanism. `apps/startx-cli/tsdown.config.ts` therefore sets `outDir: "bin"`, so
> the built binary lands at `apps/startx-cli/bin/index.mjs` — matched by the plain `"apps/"` entry
> like any other source file, with no packer-specific re-include or bin force-include involved.
> `package.json`'s own `bin` field and root `startx` script were repointed to `bin/index.mjs` to
> match, and `turbo.json`'s `build.outputs` gained `"bin/**"`.
>
> The other thing an allowlist changes silently: `files` is consulted **instead of** `.gitignore`,
> not in addition to it, so `.env`, `.env.*`, `*.pem`, `.vercel/` and `logs/` needed their own
> explicit negations in the `files` array — they're in `package.json` now alongside the build-output
> negations, where previously `.gitignore` covered them for free.
>
> Verified by running `npm pack --dry-run` against the current tree: **345 files, 386.9 kB** packed
> (1.4 MB unpacked), `apps/startx-cli/bin/index.mjs` present at 772.3 kB — versus the 3.4 MB tarball
> that shipped as `startx@1.1.60` on the registry before this fix.

**Symptom** — None today. Filed because the package works by accident.

**Cause** — `package.json` points the binary at a path that `.npmignore` excludes:

```json
"bin": { "startx": "./apps/startx-cli/dist/index.mjs" }
```
```
# .npmignore
apps/*/dist
```

npm force-includes the `bin` target regardless of ignore rules, which is why this has never broken.
Confirmed by unpacking the published artefact:

```
$ npm pack startx@latest && tar -tzf startx-1.1.60.tgz | grep dist
package/apps/startx-cli/dist/index.mjs      ← present
```

343 files in the tarball, and the binary is one of them. So it ships correctly — but the packaging
intent and the packaging rules contradict each other, and the behaviour that reconciles them is
npm-specific. Any other packer, or a future npm change, breaks the published CLI with a
`command not found` that would be very hard to trace.

**Fix** — Replace the exclude-list with an explicit allowlist in `package.json`, which is both
unambiguous and smaller:

```json
"files": [
  "apps/",
  "packages/",
  "configs/",
  "assets/",
  "startx.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "biome.json",
  ".prettierrc.cjs",
  ".prettierignore",
  ".editorconfig",
  ".env.example",
  "_gitignore",
  ".vscode/"
]
```

`files` takes precedence over `.npmignore`, so delete `.npmignore` once the allowlist is in place.
Take care here: the published tarball **is** the template the CLI copies from, so anything omitted
silently disappears from every scaffolded project. Diff the tarball before and after.

**Verify**
```bash
npm pack --dry-run 2>&1 | wc -l         # compare against the current 343 entries
npm pack --dry-run 2>&1 | grep 'startx-cli/dist/index.mjs'
```

Better: add a CI step that packs the tarball, installs it into a temp dir, and runs
`startx --version`. That turns this from a reasoning exercise into a test.

---

## B67

### B67 · `AGENTS.md` is missing from the `files` allowlist, so CI's tarball check blocks every publish

- **Status:** verified
- **Fixed in:** `c4d0dff`
- **Severity:** P1
- **Area:** ci / packaging
- **File:** `package.json` (`files`)
- **Found in:** release 1.2.0 gate, `npm pack --dry-run`, 2026-10-01

**Symptom** — `npm pack --dry-run` at the 1.2.0 release candidate lists no `AGENTS.md`. Fed that list,
publish.yml's own "Verify tarball contents" script fails:

```
required root files (13): .dockerignore, …, AGENTS.md, _gitignore, …
::error::root template file missing from tarball: AGENTS.md
1 problem(s) with the tarball.
```

So the first push to `main` after `c16145f` would have failed the publish job, and even a forced
publish would have shipped a CLI whose scaffolds never get the `AGENTS.md` that `c16145f` set out to
ship. The local E2E matrix could not see it: it runs the CLI from the repo, where the file exists.

**Cause** — `c16145f` gave `AGENTS.md` a `FileCheck` entry (`["root"]`) but did not add it to the
root `package.json` `files` allowlist, which is what decides the tarball.

**Fix** — add `"AGENTS.md"` to `files`.

**Verify**
```bash
npm pack --dry-run --json | grep AGENTS.md
# then publish.yml's verify-tarball.mjs against the pack list → 0 problems
```

