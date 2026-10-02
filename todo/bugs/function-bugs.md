# Function bugs

Defects in executable logic — a function computes or decides the wrong thing.
Register: [`bugs.md`](bugs.md). Entry template: [`../README.md`](../README.md#6-how-to-work-this-folder).

Contents: [B2](#b2) · [B3](#b3) · [B15](#b15) · [B16](#b16) · [B17](#b17) · [B18](#b18) ·
[B19](#b19) · [B20](#b20) · [B21](#b21) · [B27](#b27) · [B34](#b34) · [B35](#b35) · [B38](#b38) ·
[B39](#b39) · [B40](#b40) · [B71](#b71) · [B72](#b72) · [B76](#b76) · [B88](#b88)

---

## B2

### B2 · `defineEnv` deletes keys from `process.env`, including `NODE_ENV`

- **Status:** verified
- **Severity:** P0
- **Area:** `@repo/env`
- **File:** `packages/@repo/env/src/define-env.ts:48-52`
- **Fixed in:** `caca799`

> **Resolved.** The `tempEnv` Map and the `delete process.env[...]` are gone; `defineEnv` now reads
> `process.env` without mutating it. Empty-string values still fall back to the declared default,
> matching the previous truthiness check.
>
> Verified: with `NODE_ENV=production` and `PORT=4321` set, importing `@repo/env` leaves both intact
> in `process.env`. Previously both were `undefined` afterwards.

**Symptom** — After anything imports `@repo/env`, `process.env.NODE_ENV` is `undefined` for the
rest of the process. Express silently stays in development mode (verbose errors, no view caching),
and any library that branches on `process.env.NODE_ENV` takes its development path in production.
`process.env.PORT` is affected the same way.

**Cause** — `defineEnv` moves each declared variable out of `process.env` into a module-local Map:

```ts
if (process.env[normalized.env]) {
  tempEnv.set(normalized.env, process.env[normalized.env] ?? "");
  delete process.env[normalized.env];
}
const raw = tempEnv.get(normalized.env);
```

`packages/@repo/env/src/default-env.ts:6` declares `NODE_ENV`, and `default-env.ts` is evaluated on
import of the package. The `delete` is unconditional and permanent.

Two further consequences:
- The function becomes **order-dependent** — a second `defineEnv` call for the same key only works
  because `tempEnv` happens to be a shared module singleton.
- If two copies of `@repo/env` are ever loaded (the bundled CLI alongside the workspace source),
  the second copy reads an already-emptied `process.env` and falls back to defaults or throws.

**Fix** — Read from `process.env` without mutating it. Delete the `tempEnv` Map and the `delete`
statement entirely:

```ts
const raw = process.env[normalized.env] ?? undefined;
rawEnv[key as string] = raw === undefined ? normalized.default : raw;
```

If the goal was to stop downstream code reading raw env directly, enforce that with a lint rule
(`no-process-env`), not by mutating global state at runtime.

**Verify**
```bash
node -e 'process.env.NODE_ENV="production";
  import("@repo/env").then(()=>console.log("NODE_ENV after import:", process.env.NODE_ENV))'
# must print "production", not "undefined"
```

---

## B3

### B3 · OTP TTL is 3.5 days instead of 5 minutes, over a 9 000-code space, with no attempt limit

- **Status:** verified (partial — see below)
- **Severity:** P0
- **Area:** `@repo/lib`
- **File:** `packages/@repo/lib/src/otp-module/index.ts:20,31`
- **Fixed in:** `caca799`
- **Security impact:** yes — see [security-bugs.md](security-bugs.md) for the hardening context.

> **Resolved**, all three sub-defects:
> 1. `otpExpirationMs` → `otpExpirySeconds = Time.minutes(5).seconds` (**300**, was 300 000). The
>    unit is now in the name so it cannot drift again.
> 2. New `Random.generateCode(digits)` in `utils.ts` draws uniformly from the *whole* keyspace.
>    `generateNumber` is unchanged for its other caller (`apps/cli`). OTPs are now 6 digits →
>    1 000 000 outcomes, up from 9 000.
> 3. `maxAttempts = 5`. A failed guess increments `attempts` and re-sets the key with its
>    **remaining** lifetime (via a stored `expiresAt`), so guessing can never extend the window.
>    Hitting the limit deletes the code.
>
> **Verified:** `Time.minutes(5).seconds === 300`. `generateCode(6)` over 200 000 draws — length
> always 6, and 19 951 (9.98%) start with `0`, exactly the uniform expectation; `generateNumber(6)`
> produces 0 leading-zero codes across 50 000 draws.
>
> **NOT verified:** the Redis round-trip and the attempt-limit path never ran — no Redis or Docker
> on the machine. Before closing this, run the TTL check in **Verify** below against a real Redis,
> and add the attempt-limit test from [E8](../enhancements/template-enhancements.md#e8).

**Symptom** — An emailed one-time code stays valid for roughly three and a half days and can be
guessed by brute force.

**Cause** — Three compounding defects.

1. **Unit mismatch.** The constant is milliseconds:
   ```ts
   private static otpExpirationMs = 5 * 60 * 1000;          // 300000
   await getRedis().set(email, {...}, this.otpExpirationMs);
   ```
   but `RedisStore.set(key, value, ttlSeconds)` (`packages/@repo/redis/src/lib/redis-module.ts:56`)
   passes its third argument straight to `SET ... EX`, which is **seconds**.
   300 000 seconds = **3 days 11 hours**.

2. **Small keyspace.** `Random.generateNumber(4)` (`packages/@repo/lib/src/utils.ts:38`) is
   `crypto.randomInt(1000, 10000)` — 9 000 values, and never a leading zero. The
   `String(...).padStart(4, "0")` call and its "preserve leading zeros" comment are therefore
   misleading: no generated code can start with `0`.

3. **No rate limiting.** `verifyMailOTP` (`otp-module/index.ts:64`) compares and returns. There is no
   attempt counter, no lockout, and a failed attempt does not consume the code.

**Fix**
- Rename the constant to `otpExpirySeconds = 5 * 60` and pass that. Better: use the existing
  `Time` helper — `Time.minutes(5).seconds` — so the unit is explicit at the call site.
- Widen to 6 digits: `String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")` — a uniform
  1 000 000-value space that genuinely can have leading zeros.
- Store an `attempts` counter on the Redis record; delete the record after 5 failures.

**Verify**
```bash
# after the fix, with a running Redis:
node -e '(async()=>{const {OTPModule}=await import("@repo/lib/otp-module");
  await OTPModule.sendMailOTP({email:"a@b.c"});})()'
redis-cli TTL otp:a@b.c    # must be <= 300, not 300000
```

---

## B15

### B15 · `web-client` gets the wrong `typecheck` script whenever a backend app is co-selected

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/configs/scripts.ts:190-203`
- **Fixed in:** `c104915`

> **Resolved.** Reorder only — Fix option 1. The `["react-router","frontend"]` entry now sits
> above `["node"]` in the `typecheck` array (`configs/scripts.ts:198-203`).
>
> Option 2 (most-specific-wins selection) was **not** adopted. The root package's own tag set is
> a superset of every selected app's broadcast tags, so "longest satisfied tag array wins" would
> also win there: for `build` it would hand the root `tsdown --config-loader unrun` instead of
> `turbo run build`, and for `format`/`format:check` it would hand the root `biome format --write .`
> instead of `turbo run format`. Rejected as a regression to those three generated root scripts,
> not pursued.

**Symptom** — Scaffold a workspace with both `web-client` and `core-server`. `web-client`'s
generated `package.json` gets `"typecheck": "tsc --noEmit"`, and running it fails: React Router's
generated route types (`.react-router/types/**`) were never produced.

Scaffold `web-client` **alone** and it correctly gets `react-router typegen && tsc`. The bug only
appears in mixed workspaces, which is the common case.

**Cause** — Script selection is first-match-wins over an ordered array
(`file-handler.ts:47-53` calls `value.find(...)`), and the entries are ordered:

```ts
"typecheck": [
  { script: "turbo run typecheck",          tags: ["node", "root"] },
  { script: "tsc --noEmit",                 tags: ["node"] },              // ← matches first
  { script: "react-router typegen && tsc",  tags: ["react-router", "frontend"] },
],
```

`node` is a **gTag** broadcast by `core-server`, `cli` and `queue-worker`, so it is in *every*
package's tag set once any backend app is selected. The `["node"]` entry is strictly more general
than the `["react-router","frontend"]` entry but sits above it.

**Fix** — Two options:

1. *Minimal:* move the `["react-router","frontend"]` entry above the `["node"]` entry. Audit every
   other script name for the same ordering hazard — `dev`, `build` and `start` are ordered correctly
   today only by luck.
2. *Robust:* change `find` to a most-specific-wins selection — among all entries whose tags are
   satisfied, take the one with the largest `tags.length`, breaking ties by array order.

Option 2 removes a whole class of future ordering bugs and is a ~5-line change in `file-handler.ts`.

**Verify**
```bash
# scaffold with both apps, then:
node -p "require('./<proj>/apps/web-client/package.json').scripts.typecheck"
# must be "react-router typegen && tsc"
```

---

## B16

### B16 · `handlePackageJson` drops `private`, `bin`, `main`, `peerDependencies` and `startx`

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/utils/file-handler.ts:110-118`
- **Fixed in:** `c104915`

> **Resolved.** Rebuilt from a source spread instead of a fixed whitelist: `packageJson` now starts
> as `...structuredClone(props.app)` (`file-handler.ts:111-118`) — `structuredClone` so a later
> mutation of the emitted object can't alias back into the in-memory template and poison every
> other package emitted in the same run.
>
> The shipped fix is **asymmetric by design**. Non-root packages: spread, then delete a denylist of
> generator-only fields — `startx`, `author`, `license`, `keywords`, `repository`, `homepage`,
> `bugs`, `publishConfig` (`file-handler.ts:127-141`). The root package: an explicit **allowlist**
> instead (`rootFields`, `file-handler.ts:144-159`) — anything not named is deleted. A denylist for
> root was tried first and rejected: it's a snapshot that silently passes through any field added to
> the template root later. A synthetic test that added `workspaces`, `pnpm`, `resolutions` and
> `overrides` to the template root's `package.json` leaked all four straight into the generated
> workspace root under the denylist version.
>
> Also fixed in the same pass: the bogus `"main": "index.js"` — pointing at a file that does not
> exist in generated output — was deleted from `apps/cli/package.json` and
> `apps/startx-cli/package.json`.

**Symptom** — Generated packages lose fields the template declared:
- `ui` loses `peerDependencies: { react: "^19.0.0" }`, so nothing pins the React version.
- Ten template packages declared `"private": true` and come out **publishable**.
- Any template with a `bin` or `main` would lose it.
- The `startx` metadata block is gone, so a generated workspace cannot be re-introspected.

**Cause** — The output object is assembled from a fixed field whitelist rather than by transforming
the input:

```ts
const packageJson = {
  name, description, type: "module", exports, files, scripts,
  dependencies, devDependencies, ...workspaceAttr,
};
```

Anything not named here is discarded silently.

**Fix** — Invert it: spread the source and override, rather than rebuild.

```ts
const packageJson = {
  ...props.app,
  name: props.name || props.app.name,
  type: "module",
  scripts: packageScript,
  dependencies,
  devDependencies,
  ...workspaceAttr,
};
delete packageJson.startx;   // explicit, intentional removals only
```

Keep `objSorter` as-is for field ordering. Decide deliberately whether `startx` should survive into
the generated repo — if `startx package add` is ever meant to read the user's own workspace metadata,
it must.

**Verify**
```bash
node -p "require('./<proj>/packages/ui/package.json').peerDependencies"   # { react: '^19.0.0' }
node -p "require('./<proj>/packages/ui/package.json').private"            # true
```

---

## B17

### B17 · `init` resolves only one level of the dependency closure

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/commands/init.ts:369-383`
- **Fixed in:** `c104915`

> **Resolved.** `getPackageDeps` (`commands/init.ts:456-462`) now delegates to a shared
> `resolvePackageClosure` BFS in the new `utils/closure.ts`, seeded with the caller's packages and
> filtered to drop the seeds themselves afterward. `startx package add`'s own closure resolver was
> deleted from `package.ts` and replaced with a call to the same shared function
> (`commands/package.ts:59-65`), so `init` and `package add` now agree on what "required" means for
> a multi-level chain.

**Symptom** — A generated workspace can be missing a transitive workspace package, so
`pnpm install` fails on an unresolvable `workspace:^` dependency.

**Cause** — `getPackageDeps` snapshots the map before iterating, so newly discovered dependencies
are never themselves expanded:

```ts
const deps = new Map(props.pkgs.map(pkg => [pkg.name, pkg]));
Array.from(deps.values()).forEach(pkg => {      // ← snapshot taken here
  ...required.forEach(reqPkgName => { deps.set(config.name, config); });
});
```

A chain A → B → C stops at B. `package.ts:292-320` (`resolvePackageClosure`) implements the same
concept correctly, as a queue-driven BFS — the two commands disagree about what "required" means.

**Fix** — Delete `getPackageDeps` and call `resolvePackageClosure`. Move it to a shared module
(`utils/closure.ts`) imported by both commands, so there is exactly one implementation.

**Verify** — Add a template package with a two-level `requiredDeps` chain, run `init`, and assert
the leaf package exists in the output tree. Best covered by [E1](../enhancements/cli-enhancements.md#e1).

---

## B18

### B18 · "Overwrite?" merges into the existing tree instead of overwriting

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/commands/init.ts:341-357`
- **Fixed in:** `c104915`

> **Resolved.** Kept merge as the default and matched the wording to it, then added the destructive
> variant behind an explicit `-f, --force` flag, per the Fix section's preferred option. Without
> `--force`, the prompt now reads "...already exists and is not empty (N entries). Merge the new
> workspace into it? ... (re-run with --force to clear the directory first)" (`init.ts:357-368`) —
> nothing is removed. With `--force`, a second, explicitly-worded confirmation ("PERMANENTLY DELETE
> all N entries... This cannot be undone.") gates an actual clear.
>
> The clear path shipped far stronger than a lexical path check, because a lexical check is not
> safe: `path.resolve` does not dereference symlinks, but `fs.readdir`/`fs.rm` do —
> `ln -s ~ ./h && startx init x -d h --force` would have emptied `$HOME`. `assertSafeToClear`
> (`init.ts:408-449`) is async, resolves the real path via `fs.realpath`, refuses when the target is
> an ancestor of `cwd`, and refuses an exact-match denylist of filesystem roots, `$HOME`, `$TMPDIR`
> and well-known subdirectories (`Documents`, `Desktop`, …) before any `fs.rm` runs.

**Symptom** — Re-running `init` into an existing directory and answering **yes** to
`Directory "<x>" already exists and is not empty. Overwrite?` leaves stale files behind. Files that
the previous run produced but the new selection does not include survive, so the result is a
half-and-half workspace that may not build.

**Cause** — The prompt gates nothing but the `throw`. On "yes", `run()` proceeds straight to
`installWorkspace()` / `installPackage()`, which only ever write files. Nothing is removed.

**Fix** — Pick one and make the prompt match the behaviour:
- *Honest wording:* change the prompt to `"… already exists and is not empty. Merge into it?"`, or
- *Honest behaviour:* on confirmation, `rm -rf` the target contents before writing — in which case
  the prompt must say so explicitly, since it is destructive.

Preferred: keep merge as the default, and add an explicit `--force` flag for the clearing variant.

**Verify** — Scaffold, drop a `stale.txt` into the output, re-run `init` and confirm; assert the
observed behaviour matches the prompt's wording.

---

## B19

### B19 · Renaming across scopes writes to the template's scope directory

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/commands/package.ts:558-562`
- **Fixed in:** `c104915`

> **Resolved**, together with a related `--name`/`--dir` containment gap found in the same area.
> `getDestinationPath` (`package.ts:548-563`) now derives the scope directory from the **new** name,
> not the template's, while keeping the template's top-level bucket (`apps`/`packages`/`configs`).
> This is gated by `bucketAllowsScopeDir` (`package.ts:565-577`), which reads the user's real
> `pnpm-workspace.yaml` globs — fetched via `CliUtils.parsePnpmWorkspace` (`package.ts:120-122`) —
> and only creates a scope directory when a glob actually reaches `<bucket>/<scope>/<leaf>`;
> otherwise the package would land outside every workspace glob and pnpm would never link it.
>
> Separately: `--name` previously bypassed `packageNameSchema` entirely (only the interactive prompt
> validated it), so `package add drizzle -n ../../.ssh/authorized_keys` wrote outside the workspace.
> Shipped: `validatePackageName` (`package.ts:580-587`) runs the schema against `--name` too, and
> every filesystem destination derived from user input (`--name`, `--dir`) is passed through the new
> `assertInsideWorkspace` (`package.ts:171, 335, 589-598`), which refuses to write outside the
> resolved workspace root.

**Symptom**
```bash
startx package add @db/drizzle -n @repo/analytics
```
writes to `packages/@db/analytics` while the package inside is named `@repo/analytics`. The
directory scope and the package scope disagree.

**Cause** — `getDestinationPath` keeps the template's parent directory and only swaps the leaf:

```ts
const parentDir = path.dirname(templateRelativePath);   // "packages/@db"
const leafName  = newName.includes("/") ? newName.split("/").pop()! : newName;
return path.join(parentDir, leafName);                  // "packages/@db/analytics"
```

The new name's own scope is discarded.

**Fix** — Derive the destination from the new name when it is scoped, reusing the existing
`getDefaultPackagePath` logic and preserving the top-level bucket (`apps` / `packages` / `configs`):

```ts
const bucket = templateRelativePath.split(path.sep)[0];          // "packages"
if (newName.startsWith("@")) {
  const [scope, leaf] = newName.split("/");
  return path.join(bucket, scope, leaf);
}
return path.join(bucket, newName);
```

**Verify**
```bash
startx package add @db/drizzle -n @repo/analytics
test -f packages/@repo/analytics/package.json
```

---

## B20

### B20 · `syncDepsWithCatalog` can emit an unresolvable `catalog:` with no warning

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/commands/package.ts:658-662`
- **Fixed in:** `c104915`

> **Resolved — the Fix section above was wrong and is superseded by this note; neither of its two
> steps shipped.**
>
> Step 1 ("falling back to the version literal from the template `package.json`") is unreachable
> dead code: every `DepCheck` entry's `version` is either `"catalog:"` or `"workspace:^"`
> (`configs/deps.ts`), so there is never a version literal to fall back to once a template has
> pinned `catalog:`.
>
> Step 2 ("merge named `catalogs` into the lookup, preferring the default `catalog` on conflict")
> is itself a bug, not a fix: pnpm resolves a bare `catalog:` specifier against the **default**
> catalog only, never against a named one. Merging named catalogs into the same lookup would
> silently resolve dependencies to versions pnpm itself would never choose, and it would suppress
> the exact warning this entry exists to add.
>
> What shipped instead (`package.ts:690-736`): a bare `catalog:` is resolved against the default
> catalog only and, if unresolvable, logs `No catalog version found for <name>; it stays as
> "catalog:" and pnpm install will fail...` rather than writing a dangling entry silently. A
> separate, symmetric branch handles `catalog:<name>`, resolving against `catalogs.<name>` and
> warning the same way when that named catalog has no matching entry. `loadTemplateCatalogs`
> (`package.ts:760-786`, renamed from `loadTemplateCatalog`) returns `catalog` and `catalogs` as two
> distinct namespaces instead of merging them.

**Symptom** — After `startx package add`, `pnpm install` fails with an unresolved catalog entry, and
nothing in the CLI output hinted at it.

**Cause** — When a template dependency is already pinned to `"catalog:"` and is present in neither
the user's catalog nor the template's catalog, the code takes no action and stays silent:

```ts
if (version === "catalog:") {
  if (!existsInUserCatalog) {
    const templateVersion = templateCatalog[name];
    if (templateVersion) newEntries[name] = templateVersion;   // else: nothing, no warning
  }
}
```

The dependency is still written into the emitted `package.json` as `"catalog:"`, pointing at nothing.

Secondary defect in the same area: `loadTemplateCatalog` (`package.ts:686`) reads only the default
`catalog` key and ignores named `catalogs`, even though `PnpmWorkspace` in `types.ts:70` already
types them.

**Fix**
1. Add an `else` branch that collects the name and emits
   `logger.warn("No catalog version found for <name>; pinning to <literal> instead")`, falling back
   to the version literal from the template `package.json` where one exists.
2. Extend `loadTemplateCatalog` to merge named `catalogs` into the lookup, preferring the default
   `catalog` on conflict.

**Verify** — Add a template dep set to `catalog:` but absent from `pnpm-workspace.yaml`, run
`package add`, and assert a warning is printed and the emitted `package.json` carries a resolvable
version.

---

## B21

### B21 · Dead ternary and a misleading log line in `installRootDependencies`

- **Status:** verified
- **Severity:** P3
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/commands/package.ts:596-602`
- **Fixed in:** `c104915`

> **Resolved** as prescribed. `installRootDependencies` (`package.ts:633-651`) now takes a
> `reason: string` parameter and logs `Running ${command} install (${reason})...`; both no-op
> ternaries are gone. Both call sites were updated: `resolveEslintPreference` passes
> `"eslint was added to the root package.json"` (`package.ts:281`), and
> `checkAndInstallMissingDeps` builds a `changes[]` array describing what actually changed —
> a packageManager bump and/or added dependencies — and passes `changes.join(" and ")`
> (`package.ts:519`). The "while here" suggestion to test or narrow npm/yarn/bun support was not
> acted on; only pnpm remains exercised.

**Symptom** — The CLI reports `Running pnpm install to install ESLint...` when it is installing
something else entirely.

**Cause**
```ts
const command = packageManager === "yarn" ? "yarn" : packageManager;
const args    = packageManager === "yarn" ? ["install"] : ["install"];   // both branches identical
logger.info(`Running ${command} ${args.join(" ")} to install ESLint...`);
```

The `args` ternary is a no-op, the `command` ternary is a no-op for the same reason, and the message
is hardcoded to ESLint because that was the original caller. There are now two call sites
(`resolveEslintPreference:269` and `checkAndInstallMissingDeps:529`).

**Fix** — Collapse to `const args = ["install"]`, drop both ternaries, and take the reason as a
parameter: `installRootDependencies(workspace, reason: string)` →
`Running ${command} install (${reason})...`.

While here: npm, yarn and bun are nominally supported via `packageManager`, but only pnpm is
exercised. Either test the others or narrow the detection to pnpm and say so.

**Verify** — Trigger the non-ESLint call path and confirm the message names the real reason.

---

## B27

### B27 · `Paginator.getPage` does no validation on user-controlled input

- **Status:** verified
- **Severity:** P3
- **Area:** `@repo/lib`
- **File:** `packages/@repo/lib/src/extra/pagination-module.ts:4-10`
- **Fixed in:** `c104915`
- **Security impact:** yes — unbounded `LIMIT` is a cheap DoS vector.

> **Resolved**, more thoroughly than the Fix section sketched. `Paginator.getPage`
> (`pagination-module.ts`) gained a `toPositiveInt` parser that rejects non-decimal notation
> (`0x10`, `0b111`) via an explicit `NUMERIC` regex, trims and rejects blank strings before
> coercion, and floors the result through `clampPositive` into `[1, Number.MAX_SAFE_INTEGER]`.
> `limit` is capped by a configurable `maxLimit` (default `MAX_PAGE_LIMIT = 100`, as the Fix
> proposed) via a new `PageOptions` argument on both `getPage` and `paginate`, with a
> `toOptionInt` guard so a caller passing `NaN`/non-finite options can't collapse the clamp. `page`
> is additionally capped so `(page - 1) * limit` can never overflow past `Number.MAX_SAFE_INTEGER`,
> and `paginate`'s `total` is sanitized the same way before computing `totalPages`, closing the
> `?limit=0` → `Infinity` case named in the Cause section.

**Symptom** — `page` and `limit` arrive straight from the query string and go into SQL
`LIMIT`/`OFFSET` unchecked:

| Request | Result |
|---|---|
| `?page=abc` | `parseInt` → `NaN` → `NaN` offset → driver error / 500 |
| `?page=0` | offset `-10` → negative OFFSET → SQL error |
| `?page=-5` | offset `-60` → SQL error |
| `?limit=1000000000` | unbounded result set — memory blow-up |

**Cause**
```ts
const page   = parseInt(query.page  ?? "1",  10);
const limit  = parseInt(query.limit ?? "10", 10);
const offset = (page - 1) * limit;
```

No `Number.isFinite` guard, no floor, no ceiling. `paginate()` then divides by `limit`, so
`?limit=0` also yields `Infinity` for `totalPages`.

**Fix** — Clamp both values:

```ts
const MAX_LIMIT = 100;
const toInt = (v: string | undefined, fallback: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};
const page  = Math.max(1, toInt(query.page, 1));
const limit = Math.min(MAX_LIMIT, Math.max(1, toInt(query.limit, 10)));
```

Make `MAX_LIMIT` an option so callers can raise it deliberately. Add unit tests — this is pure,
dependency-free logic and is the easiest thing in the repo to cover.

**Verify**
```ts
expect(Paginator.getPage({ page: "abc" })).toEqual({ page: 1, limit: 10, offset: 0 });
expect(Paginator.getPage({ page: "0" }).offset).toBe(0);
expect(Paginator.getPage({ limit: "999999" }).limit).toBe(100);
```

---

## B34

### B34 · Frontend-only selection never broadcasts the `"node"` gTag — every non-root package loses lint/format/format:check/test, and the formatter/config prompts are skipped

- **Status:** verified
- **Severity:** P0
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/configs/scripts.ts:83-247`
- **Fixed in:** `5975f4a`

> **Resolved.** The initial gTags set at `apps/startx-cli/src/commands/init.ts:135` is now
> `new Set<TAGS>(["common", "node"])` instead of `["common"]`. That restores the
> `if (gTags.has("node"))` gate at `init.ts:164`, which had been skipping BOTH the "Select
> formatter" and "Select configs to install" prompts on a frontend-only run. Verified end-to-end
> by driving `startx init` through a pty with a frontend-only selection and confirming the
> generated root `package.json` carries `lint`, `format`, `format:check` and `test`.

**Symptom** — Scaffold a workspace selecting only a frontend app (e.g. `web-client` alone, no
backend/CLI app). The generated root `package.json` ends up with only `dev`/`build`/`start`/
`clean`/`deep:clean` — no `typecheck`, `lint`, `format`, `format:check`, or `test`. Every non-root
package in the same workspace is similarly degraded: `packages/ui`'s generated scripts are `clean`
alone, and even a backend-flavored library pulled in as a hard dependency (`packages/common`, a
`requiredDeps` of `web-client`) ends up with the same missing set. `web-client` itself is a partial
exception, not a total one: it keeps `typecheck` (`react-router typegen && tsc`, matched via the
`["react-router","frontend"]` script entry, which carries no `"node"` requirement) but still loses
`lint`, `lint:fix`, `format`, `format:check`, `test`, and `deep:clean`. On top of this, the
"Select formatter" prompt and the "Select configs to install" (eslint-config/vitest-config) prompt
are both silently skipped — there is no way to opt into either in a frontend-only run.

**Cause** — `"node"` is a **gTag**, contributed only by an app's own `startx.gTags` (backend/CLI
apps such as `core-server`, `cli`, `queue-worker`) or downstream by the formatter prompt adding
`"prettier"`/`"biome"`. In `InitCommand.getConfigPrefs`
(`apps/startx-cli/src/commands/init.ts:160`, `if (gTags.has("node"))`), the formatter prompt is
itself gated on `"node"` already being present — so a purely frontend selection can never reach it,
which means `"prettier"`/`"biome"` never enter `gTags` either. `availableConfigs`
(eslint-config/vitest-config, gated on `iTags: ["node"]`) is empty for the same reason, so that
prompt is skipped too. Downstream, almost every quality-script entry in `scripts.ts:83-247`
(`lint`, `lint:fix`, `format`, `format:check`, `test`, and the generic `tsc --noEmit` `typecheck`
fallback) requires `"node"` in the package's own tag set (broadcast gTags plus the package's own
`startx.tags`) — which, in a frontend-only run, never happens for any package, root included. The
one entry that escapes this is `typecheck`'s `["react-router","frontend"]` case, which is why
`web-client` keeps a typecheck script while everything else loses it.

**Fix** — Three options, weighed:
1. *Ungate the quality scripts from `"node"`.* Add frontend-appropriate fallback entries for
   `lint`/`format`/`format:check`/`test` the way `typecheck` already has one for
   `["react-router","frontend"]`. Most surgical, but means auditing and duplicating four script
   families instead of one, and risks a B15-style ordering hazard in each.
2. *Broadcast `"node"` whenever any package is selected* — treat it as a baseline rather than an
   opt-in contributed only by backend apps. Collapses the backend-vs-frontend axis and the
   node-tooling-vs-not axis into one; the cost is losing the ability to express "this workspace has
   zero Node-based tooling" — but every template package already assumes Node tooling (ESLint,
   TypeScript, a package manager) regardless of what runs in the browser, so that distinction isn't
   real today.
3. *Give frontend packages their own script entries* for `lint`/`format`/`format:check`/`test`
   gated on `["frontend"]`, mirroring the existing `typecheck` entry.

**Recommended: option 2.** It is a one-line change (add `"node"` to the base tag set in
`getConfigPrefs`, or drop the `"node"` requirement from the formatter/config prompts specifically)
and it fixes every script and every package from one place, instead of patching each script family
separately as in option 1 or 3. It is also the only option that restores the two skipped prompts
(formatter, eslint/vitest configs) as a side effect, rather than leaving that half of the bug
untouched.

**Verify**
```bash
# scaffold selecting only web-client, then:
node -p "require('./<proj>/package.json').scripts"                     # expect lint/format/format:check/test
node -p "require('./<proj>/apps/web-client/package.json').scripts"     # expect lint/format/format:check/test
node -p "require('./<proj>/packages/ui/package.json').scripts"         # expect more than just 'clean'
```

---

## B35

### B35 · `.vscode/settings.json` defaults to Prettier even when no formatter was ever chosen

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/commands/init.ts:315-343`
- **Found while fixing:** [B34](#b34)
- **Fixed in:** `5975f4a`

> **Resolved.** `writeVscodeSettings` in `init.ts` (~lines 315-343) now only emits
> `editor.formatOnSave` and `editor.defaultFormatter` when biome or prettier was actually chosen.
> But that edit is **defensive only**. The real trigger for this bug was [B34](#b34): the
> formatter prompt at `init.ts:164-178` offers only `["prettier + biome", "prettier"]` with
> `required: true`, so there is no "no formatter" answer a user can give. The only way to reach
> the bug was B34 skipping the prompt entirely. B35 is therefore closed *by B34's fix*; the guard
> added here just makes the invariant local rather than implied.

**Symptom** — In the same frontend-only scaffold as B34 (formatter prompt skipped, so neither
`"prettier"` nor `"biome"` ever enters `gTags`), the generated `.vscode/settings.json` still sets
`"editor.defaultFormatter": "esbenp.prettier-vscode"`, and `.vscode/extensions.json` still
recommends `esbenp.prettier-vscode` — in a workspace with no `.prettierrc.*` file and no `prettier`
dependency anywhere. VS Code is told to format-on-save with a formatter that was never installed.

**Cause** — `writeVscodeSettings` (`apps/startx-cli/src/commands/init.ts:315-343`) only ever
distinguishes two cases:
```ts
const usesBiome = props.tags.includes("biome");
...
"editor.defaultFormatter": usesBiome ? "biomejs.biome" : "esbenp.prettier-vscode",
```
There is no branch for "neither formatter was installed." Since `usesBiome` is the only condition
tested, "not biome" is silently treated as "must be prettier," which is false whenever the
formatter prompt itself was skipped (see B34).

**Fix** — Add a genuine "no formatter at all" branch — not a different default. Check for
`"prettier"` explicitly as well as `"biome"`, and when neither tag is present: omit
`"editor.defaultFormatter"` entirely, drop the biome/prettier entries from `codeActionsOnSave`, and
omit the formatter extension from `extensions.recommendations`, leaving only the ESLint-related
entries. There is no correct fallback formatter to pick here; the fix is to stop asserting one.

**Verify**
```bash
# scaffold a frontend-only workspace (formatter prompt skipped), then:
node -p "require('./<proj>/.vscode/settings.json')['editor.defaultFormatter']"  # must be undefined
node -p "require('./<proj>/.vscode/extensions.json').recommendations"          # must not list a formatter extension
```

---

## B38

### B38 · `startx package new` emits no `format`/`format:check` script

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/commands/package.ts:398-436`
- **Fixed in:** `5975f4a`

> **Resolved.** `startx package new` now emits `format` and `format:check` scripts in
> `apps/startx-cli/src/commands/package.ts`. The glob source constant was exported from
> `apps/startx-cli/src/configs/scripts.ts:4` as
> `export const topLevelSources = "*.{ts,tsx,js,jsx,cjs,mjs,json,css,md,yaml,yml}"` and imported
> by `package.ts`, so `package new` and `init` can no longer drift apart. The scripts are
> `prettier --write src "${topLevelSources}" --no-error-on-unmatched-pattern` — the previous
> draft checked only `src`, which silently never format-checked a package's top-level files.

**Symptom** — Run `startx package new` in a workspace that uses Prettier or Biome everywhere else.
The generated package's `package.json` gets `typecheck` and `clean`, plus `lint`/`lint:fix` and
`test` when those are enabled — but never a `format` or `format:check` script, regardless of the
workspace's formatter. `turbo run format`/`format:check` at the root silently skips the new
package, and there is no per-package way to format-check it either.

**Cause** — `PackageCommand.createPackageJson` (`apps/startx-cli/src/commands/package.ts:398-436`)
builds `scripts` from a fixed `typecheck`/`clean` pair plus conditional `lint`/`lint:fix` (if
`eslintEnabled`) and `test` (if `vitestEnabled`) — there is no equivalent conditional for a
formatter. Contrast with `getInstallTags`
(`apps/startx-cli/src/commands/package.ts:287-302`), used by the same command's `package add` path,
which inspects the root `package.json` for `@biomejs/biome`/`prettier` via `hasDependency`.
`createPackageJson` never performs that check, so `format`/`format:check` keys are never added.

**Fix** — Have `createPackageJson` (or its caller) read the root package.json's formatter
dependency the same way `getInstallTags` already does, and conditionally add:
```ts
if (hasBiome) {
  scripts.format = "biome format --write .";
  scripts["format:check"] = "biome ci .";
} else if (hasPrettier) {
  scripts.format = "prettier --write src --no-error-on-unmatched-pattern";
  scripts["format:check"] = "prettier --check src --no-error-on-unmatched-pattern";
}
```
mirroring the tag-gated `format`/`format:check` entries already in `configs/scripts.ts`.

**Verify**
```bash
# in a workspace with prettier or biome installed at the root:
startx package new my-pkg
node -p "require('./packages/my-pkg/package.json').scripts['format:check']"  # must be defined
```

---

## B39

### B39 · `startx package new` leaks generator-only `startx` metadata into user packages

- **Status:** verified
- **Severity:** P3
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/commands/package.ts:212-215`
- **Fixed in:** `5975f4a`

> **Resolved.** Fixed by a new `FileHandler.stripGeneratorFields()` in
> `apps/startx-cli/src/utils/file-handler.ts`, stripping `generatorFields = ["startx","author",
> "license","keywords","repository","homepage","bugs","publishConfig"]`. Also note: a reviewer
> flagged the strip as possibly wrong (would it discard a user's own `startx` block?). It was
> checked — every read of `.startx` metadata in the CLI resolves through `getPackageList()` →
> `getDirectory().template`, i.e. the *bundled* template directory, never a user workspace. So
> stripping is correct, and it was the *construction* of a `startx: { iTags, requiredDevDeps,
> ignore }` block inside `createPackageJson` that was dead code. That construction and its
> now-unused `ignore` array were removed.

**Symptom** — A package created via `startx package new` carries a `startx` block (e.g.
`{ iTags: ["node"], requiredDevDeps: [...] }`) in its committed `package.json`. The exact same kind
of package installed via `startx init` or `startx package add` does not — those paths strip it.

**Cause** — `PackageCommand.create` writes the new package's `package.json` via
`this.createPackageJson(...)` directly (`apps/startx-cli/src/commands/package.ts:212-215`:
`this.writeJson(path.join(packageDir, "package.json"), this.createPackageJson({...}))`), bypassing
`FileHandler.handlePackageJson` entirely. `createPackageJson` (`package.ts:398-436`) explicitly
returns a `startx: {...}` block as part of its result. Every other install path (`init`,
`package add`) routes through `FileHandler.handlePackageJson`, whose `generatorFields` allowlist
(`apps/startx-cli/src/utils/file-handler.ts:127-140` — "Metadata describing the generator rather
than the workspace being generated... must not be inherited") deletes the `startx` field before
writing. `PackageCommand.create` never passes through that strip step.

**Fix** — Route `PackageCommand.create`'s package.json through the same `generatorFields`
deletion `FileHandler.handlePackageJson` already applies — either by calling `handlePackageJson`
itself, or by extracting the delete step into a small shared helper both call — rather than writing
`createPackageJson`'s return value verbatim via `writeJson`.

**Verify**
```bash
startx package new my-pkg
node -p "require('./packages/my-pkg/package.json').startx"   # must be undefined
```

---

## B40

### B40 · `peerDependencies` bypasses `filterDeps` and `syncDepsWithCatalog`

- **Status:** verified
- **Severity:** P2
- **Area:** `startx-cli`
- **File:** `apps/startx-cli/src/utils/file-handler.ts:55-61`
- **Found while fixing:** [B16](#b16)
- **Fixed in:** `5975f4a`

> **Resolved.** `peerDependencies` is now routed through `filterDeps` in
> `apps/startx-cli/src/utils/file-handler.ts`, same as `dependencies` and `devDependencies`.

**Symptom** — A `peerDependencies` entry in a template package ships into generated output
completely unfiltered: it is never tag-checked (so it always ships regardless of whether the
consuming package's tags actually warrant it) and never catalog-synced (so a `catalog:`/
`workspace:` specifier in a peer dependency would ship unresolved and break `pnpm install`). This
is currently latent — the only template `peerDependencies` block, `packages/ui/package.json`'s
`{ "react": "^19.0.0" }`, is a plain semver literal — but the gap is real and will surface the
moment a future peer dependency uses `catalog:` syntax.

**Cause** — `FileHandler.handlePackageJson`'s `filterDeps`
(`apps/startx-cli/src/utils/file-handler.ts:55-61`) is applied only to `props.app.dependencies` and
`props.app.devDependencies`; `peerDependencies` passes through raw via `structuredClone(props.app)`
(line 115) with no tag-based filtering at all. `PackageCommand.syncDepsWithCatalog`
(`apps/startx-cli/src/commands/package.ts:683-736`) has the same gap: `processMap` is called only
on `deps`/`devDeps` (lines 735-736); `peerDependencies` is never passed in. Both functions were
written to only ever look at `dependencies`/`devDependencies`; `peerDependencies` was reintroduced
into the emitted output by [B16](#b16)'s fix (which changed `handlePackageJson` to spread
`props.app` instead of rebuilding from a fixed whitelist) without extending either `filterDeps` or
`syncDepsWithCatalog` to cover the newly-restored field.

**Fix** — Extend both functions to treat `peerDependencies` like the other two dependency maps: run
it through `filterDeps` in `handlePackageJson`, and pass it to `processMap` in
`syncDepsWithCatalog` — while reviewing whether the tag-filter and catalog-sync behavior need
peer-specific semantics (peer deps are conventionally left broad/unpinned) rather than being copied
verbatim from the `dependencies` handling.

**Verify**
```bash
# add a template peerDependencies entry using catalog:, e.g. packages/ui/package.json:
#   "peerDependencies": { "react": "catalog:" }
startx init   # or: startx package add
node -p "require('./<proj>/packages/ui/package.json').peerDependencies"
# must resolve to a real version/catalog entry, not the literal string "catalog:"
```

## B60

### B60 · `copyValidatedFilesFromFolder` swallows copy errors — a broken scaffold exits 0

- **Status:** verified
- **Fixed in:** `074cb15` · test `3aa7742` — forced gate 71/71, exit 0 at `9e67d07` (214 tests)
- **Severity:** P2
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/init.ts`
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — A file that fails to copy (permissions, ENOSPC) is only logged. `init` still exits 0 and prints success.

**Cause** — Each copy is wrapped in try/catch and the error is logged, with no rethrow.

**Fix** — Collect the failures and throw at the end, after attempting every file, so the run exits non-zero and names every file that failed.

**Verify** — unit test / manual: unreadable template file → `init` exits 1

---

## B61

### B61 · `package add` rewrites the workspace `packageManager` to `pnpm@11.5.1` without asking

- **Status:** verified
- **Fixed in:** `7ac001f` — forced gate 71/71, exit 0 at `9e67d07` (214 tests)
- **Severity:** P2
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/package.ts` (`ensureMinimumPackageManager`)
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — Running `package add` in a workspace pinned to `pnpm@10.x` silently changes the pin. The only trace is one info line.

**Cause** — The bump is unconditional whenever the major is below 11.

**Fix** — Ask before bumping (default yes). If declined, warn and leave the pin alone.

**Verify** — manual: pnpm@10 workspace → prompt appears; declining leaves the pin

---

## B62

### B62 · `assertInsideWorkspace` rejects a valid directory named `..foo`

- **Status:** verified
- **Fixed in:** `7ac001f` — forced gate 71/71, exit 0 at `9e67d07` (214 tests)
- **Severity:** P3
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/package.ts` (`assertInsideWorkspace`)
- **Found in:** review of `main...c16145f`, 2026-10-01

**Symptom** — `startx package new x -d ..foo` is refused as being outside the workspace.

**Cause** — `relative.startsWith("..")` also matches path segments that merely begin with two dots.

**Fix** — Treat the path as escaping only when the first segment is exactly `..`.

**Verify** — unit test

---

## B64

### B64 · `package add` can never add a root tool dependency — `"root"` is never in its tag set

- **Status:** verified
- **Fixed in:** `7ac001f` — forced gate 71/71, exit 0 at `9e67d07` (214 tests)
- **Severity:** P2
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/package.ts` (`getInstallTags`, `checkAndInstallMissingDeps`)
- **Found in:** review of `main...c16145f`, 2026-10-01 (startx review agent)

**Symptom** — A web-only workspace runs `package add core-server`, but `tsdown` is never added to the root, so `core-server#build` fails with `tsdown: not found`.

**Cause** — Every root entry in `DepCheck` carries the `root` tag, and `getInstallTags` never adds it, so `config.tags.every(...)` is always false.

**Fix** — Include `root` when matching root-level DepCheck entries in `checkAndInstallMissingDeps`, still subject to `ignoredRootTools`.

**Verify** — package E2E: web-only + `package add core-server` → install → build passes

---

## B65

### B65 · Root `.gitignore` and `_gitignore` are both copied to `<scaffold>/.gitignore`; readdir order picks the winner

- **Status:** verified
- **Fixed in:** `e8467b8` — forced gate 71/71, exit 0 at `9e67d07` (214 tests)
- **Severity:** P2
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/configs/files.ts`, `commands/init.ts`
- **Found in:** review of `main...c16145f`, 2026-10-01 (startx review agent)

**Symptom** — Today `_gitignore` happens to be copied last and wins. If readdir returns `.gitignore` last, the scaffold gets the startx repo's own ignore file instead.

**Cause** — `.gitignore` has no `FileCheck` entry, so it's copied unconditionally, and `_gitignore` is renamed to the same destination.

**Fix** — Tag the root `.gitignore` `["never"]`.

**Verify** — scaffold `.gitignore` is byte-identical to `_gitignore`

---

## B71

### B71 · `package new` writes `tsconfig.json` with 2-space indent, so a new package fails `format:check` immediately

- **Status:** verified
- **Severity:** P1
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/package.ts:224`
- **Found in:** package E2E `tsk_g84rp5ak`, 2026-10-01
- **Fixed in:** `769a73a` + `9d07982` — tabs alone weren't enough: prettier and biome also collapse `"include": ["src/**/*.ts"]` onto one line, and `JSON.stringify` never does. The package E2E caught it. The tsconfig is now the literal `NEW_PACKAGE_TSCONFIG`, and a `package.test.ts` case runs it through prettier with the template config and expects no change. package E2E 2026-10-01 (`package add`/`new` in three scaffolds, then install and `--force` gate: 56/56, 27/27, 45/45; 0 unresolved catalog refs) includes three `package new` packages under prettier, and `biome ci .` passes on a `package new` in full-biome.

**Symptom** — `startx package new @repo/foo`, then install and the gate: `@repo/foo#format:check` fails on `tsconfig.json`. This happens under both prettier and biome (both reformat it to tabs). Gate: 41/43 with two new packages.

**Cause** — `create()` writes the tsconfig with `JSON.stringify(..., null, 2)`, while `package.json` goes through `writeJson` with `"\t"`. House style is tabs.

**Fix** — Write the tsconfig through `this.writeJson` (tab indent, trailing newline).

**Verify** — `package new @repo/foo` in a prettier workspace and in a biome workspace → install → forced gate passes.

---

## B72

### B72 · Dead `"vine": "link:@types/vinejs/vine"` devDependency in `@repo/lib`, which `package add` then writes into the catalog, breaking `pnpm install`

- **Status:** verified
- **Severity:** P1
- **Area:** @repo/lib, startx-cli
- **File:** `packages/@repo/lib/package.json:26`; `apps/startx-cli/src/commands/package.ts` (`syncDepsWithCatalog`)
- **Found in:** package E2E `tsk_g84rp5ak`, 2026-10-01
- **Fixed in:** `3efef2d` — the `vine` link devDependency is removed from `@repo/lib` (lockfile updated). `syncDepsWithCatalog` only catalogs registry specs: it skips specs containing `:`, `/` or `\`, or starting with `.`. Covered by a `package.test.ts` case. package E2E 2026-10-01 (`package add`/`new` in three scaffolds, then install and `--force` gate: 56/56, 27/27, 45/45; 0 unresolved catalog refs) — every install succeeds.

**Symptom** — web-only workspace + `package add core-server` (which brings in `@repo/lib`) → `pnpm install` fails with `ERR_PNPM_CATALOG_ENTRY_INVALID_SPEC: The entry for 'vine' in catalog 'default' declares a dependency using the 'link' protocol`. Separately, every scaffold's `@repo/lib/node_modules/vine` is a dangling symlink.

**Cause** — Two defects. (1) The devDependency has been in the template since `fd4a3b7` (2026-02-23); nothing imports `vine`, and `packages/@repo/lib/@types/vinejs/vine` doesn't exist. (2) `syncDepsWithCatalog`'s `processMap` moves every non-`workspace:`, non-`catalog:` spec into the catalog, including `link:`, `file:`, `git+…`, `npm:` aliases and URLs, which pnpm catalogs reject.

**Fix** — Delete the `vine` devDependency. In `processMap`, catalog only plain semver ranges and dist-tags; leave other protocols in place untouched.

**Verify** — web-only + `package add core-server` → install exit 0 → forced gate passes; `grep -n vine pnpm-workspace.yaml` matches nothing.

---

## B76

### B76 · `package list` shows `mode: "silent"` packages, and `package add startx-cli` installs the CLI itself into a user's workspace

- **Status:** verified
- **Severity:** P3
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/package.ts:67` (`list`), `:100` (`add`)
- **Found in:** package E2E `tsk_g84rp5ak`, 2026-10-01
- **Fixed in:** `6963d2a` — `package list` hides `mode: "silent"` packages, and `assertAddable` refuses a silent package that no template depends on. Covered by `package.test.ts`. Live on full-biome: `package list` shows none of startx-cli/tsdown-config/typescript-config, and `package add startx-cli` fails with `"startx-cli" is internal to the StartX template`. publish.yml's "Smoke test packed CLI" expected every template in `package list`, so it failed the first 1.2.1 publish (run 67). It now checks that silent templates are present in the installed tarball instead. Checked by running the publish job's steps locally: the old check reproduces the CI errors, and the new one passes (`Installed CLI resolved all 21 templates.`).
- **Review follow-up:** `5fd56ce` on `fix/review-env-example`.
  - The reviewer found that the smoke's JS comment contained `` `package list` ``. Inside bash's double-quoted `node -e "…"` that is a command substitution, so the runner executed `package`. The script now goes through a quoted heredoc (`<<'SCRIPT'`), as verify-tarball's does.
  - The smoke now also runs `package add typescript-config` and `package add tsdown-config` through the installed binary in a temp workspace, and requires `package add startx-cli` to be refused without writing anything. The 1.2.0 tarball fails this check: it copies `apps/startx-cli` and exits 0.
  - `assertAddable` now seeds `resolvePackageClosure` from offered (non-silent) packages only, so a dependency declared only by startx-cli no longer makes a silent package addable.
  - `package.test.ts` now also runs against the real template: `list` hides startx-cli, tsdown-config and typescript-config; the two configs are addable; startx-cli is refused.
  - Evidence: a local replay of the publish job's Clean → Pack → Verify → Smoke steps passes with no `command not found`, and the forced gate passes (73/73, 0 cached, exit 0, 257 tests).
  - Two things the smoke surfaced, filed as [B88](#b88) and not fixed here: `add` asks about missing root deps even with `--no-install`, and it never exits while stdin stays open.

**Symptom** — `startx package list` lists `startx-cli (apps/startx-cli)`, which the interactive `add` picker hides. `startx package add startx-cli` succeeds and copies the generator into the workspace.

**Cause** — `add` filters `mode !== "silent"` only for the interactive choice; `list` doesn't filter at all. `startx-cli` is silent, but unlike the configs it's in nobody's closure, so it should never be addable.

**Fix** — Filter silent packages from `list`. Reject an explicit `add` of a package that's silent and not a closure dependency, or mark `startx-cli` `["never"]` in a way `getPackageList` honours.

**Verify** — `package list` doesn't show startx-cli; `package add startx-cli` exits non-zero with a clear message.

---

---

## B81

### B81 · `init --force`'s ancestor guard fails open for a cwd whose first segment starts with `..`

- **Status:** verified
- **Fixed in:** `d934be8` on `fix/review-env-example` — forced gate 73/73, exit 0 at `573f5cf` (252 tests); scaffold matrix server-only 36/36, worker-only 40/40, full-biome 75/75, full-prettier 75/75
- **Severity:** P2
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/init.ts` (`assertSafeToClear`)
- **Found in:** reviewer's review of the B47–B67 fixes (`tsk_jg4zgfvj`), 2026-10-01

**Symptom** — With cwd `/a/..foo`, `startx init /a --force` doesn't refuse with "current directory or one of its ancestors". After the confirm, it clears `/a`, which contains the cwd.

**Cause** — This is the [B62](#b62) prefix test, failing the other way. `path.relative("/a", "/a/..foo")` is `"..foo"`, and `!toCwd.startsWith("..")` read that as "the cwd is outside the target".

**Fix** — The cwd counts as outside only when the relative path is exactly `..`, starts with `..` plus `path.sep`, or is absolute. That is the segment test B62 uses in `assertInsideWorkspace`.

**Verify** — `init.test.ts` gains three `assertSafeToClear` cases: a `..foo` cwd refuses its parent, a plain parent is refused, and a sibling of a `..foo` cwd is allowed. The `..foo` case fails on the old code.

---

## B85

### B85 · `listFiles` still swallows readdir errors, and the cli entry uses `parse` rather than `parseAsync`

- **Status:** open
- **Severity:** P3
- **Area:** startx-cli, @repo/lib
- **File:** `packages/@repo/lib/src/file-system-module/index.ts:168` and its `.catch(() => [])` callers; the cli entry
- **Found in:** reviewer's review of the B47–B67 fixes (`tsk_jg4zgfvj`), 2026-10-01 (B60 follow-up)

**Symptom / cause** — A directory that can't be read looks empty, so a scaffold can silently miss files. With `parse`, an async command's rejection isn't awaited by commander.

**Proposed fix** — Let readdir errors propagate (or report them), and switch the entry to `await program.parseAsync()`.

---

## B88

### B88 · `package add` asks about missing root deps even with `--no-install`, and never exits while stdin stays open

- **Status:** open
- **Severity:** P3
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/package.ts` (`add`)
- **Found in:** B76 review follow-up (`tsk_6xnwfzt2`), 2026-10-01, writing the packed-CLI smoke

**Symptom** — `startx package add tsdown-config --name tsdown-config --no-eslint --no-install` in a workspace without `tsdown` still asks "Add them to the workspace root package.json? (Y/n)". With stdin at EOF this throws `ExitPromptError` and a stack trace before anything is copied. Piping `yes n |` answers the prompt and the package is written, but the process then never exits; it hit `timeout`'s exit 124. A finite `printf 'n\n…'` exits 0. publish.yml's smoke relies on that last form.

**Cause** — `--no-install` only skips the package-manager run, and no flag answers the root-deps prompt. The exit hang looks like stdin being left in flowing mode after the prompts.

**Proposed fix** — Add a `--yes`/`--no-root-deps` style flag, or skip the prompt when stdin is not a TTY. Pause or unref stdin when the prompts finish. Then drop the stdin answers from the smoke.

---

## B90

### B90 · `<Button asChild>` always throws React error #143

- **Status:** verified
- **Fixed in:** `bc900f3` — forced gate 82/82, exit 0 at `bc900f3` (293 tests)
- **Severity:** P2
- **Area:** @repo/ui
- **File:** `packages/ui/src/components/ui/button.tsx`
- **Found in:** F10 (next-app, `tsk_k43egjtc`), 2026-10-02: `next build` failed prerendering `/`

**Symptom** — `<Button asChild><a href="…">…</a></Button>`, the shadcn way to style a link as a button, throws "React.Children.only expected to receive a single React element child" (#143) on every render. No template code used `asChild` on `Button`, so no gate ever rendered it.

**Cause** — With `asChild` the component renders `Slot.Root`, but it still passes three children: the loader icon, the icon `<span>` and the caller's element. Slot accepts exactly one.

**Fix** — The caller's element is wrapped in `Slot.Slottable` when `asChild` is set. Slot then renders that element with the button's props and moves the loader and icon inside it.

**Verify** — `packages/ui/src/components/ui/button.test.tsx` (2). The `asChild` case renders an `<a>` with `data-slot="button"`, its `href` and its variant. It fails against the previous `button.tsx` (stashed) and passes with the fix. next-app's home page renders its API link through it.

---

## B91

### B91 · `ThemeProvider` reads `localStorage` during render, so any server render of it throws

- **Status:** verified
- **Fixed in:** `bc900f3` — forced gate 82/82, exit 0 at `bc900f3` (293 tests)
- **Severity:** P2
- **Area:** @repo/ui
- **File:** `packages/ui/src/components/custom/theme-provider.tsx`
- **Found in:** F10 (next-app, `tsk_k43egjtc`), 2026-10-02

**Symptom** — Under a server render (Next.js renders client components on the server too), `ThemeProvider` throws `ReferenceError: localStorage is not defined`. Avoiding the throw with a `typeof window` guard would only trade it for a hydration mismatch, because the first client render would read a different mode than the server rendered.

**Cause** — The `useState` initialisers call `localStorage.getItem`. That was fine while the only consumer was web-client's SPA build, which never renders on a server.

**Fix** — State starts at `defaultMode` / `defaultColor`, and a `useLayoutEffect` applies the stored values after mount. The server render and the first client render therefore match, and the stored theme still lands before the first paint. web-client's SPA behaviour is unchanged.

**Verify** — next-app `next build` prerenders `/`. In headless Chromium (template and `next-only` scaffold), `<html>` has class `light`; after `localStorage["app-theme-mode"]="dark"` and a reload it has `dark`, with no hydration warnings in the console.

---

## B92

### B92 · `package add bun-server` into an older workspace breaks `pnpm install` (`bun` build not in `allowBuilds`)

- **Status:** open
- **Severity:** P3
- **Area:** startx-cli
- **File:** `apps/startx-cli/src/commands/package.ts` (root dependency reconciliation)
- **Found in:** F11 (bun-server, `tsk_r3837m7y`), 2026-10-02

**Symptom** — In a workspace whose `pnpm-workspace.yaml` predates F11, `startx package add bun-server` adds `bun` to the root devDependencies. The next `pnpm install` then exits 1 with `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: bun@1.4.2`, and `node_modules/.bin/bun` prints "Bun's postinstall script was not run". Reproduced in a scratch pnpm 11.5.1 workspace without the `allowBuilds` entry.

**Cause** — The binary comes from `bun`'s postinstall, which only runs when `allowBuilds` lists it. `init` ships that line in the template's `pnpm-workspace.yaml`. `package add` reconciles `catalog:` entries into an existing workspace, but not `allowBuilds`.

**Proposed fix** — When a root dependency that needs a build script is added, `package add` also writes its `allowBuilds` entry (`bun: true`), the way it already adds missing catalog entries. Until then: add `bun: true` under `allowBuilds`, or run `pnpm approve-builds`.

