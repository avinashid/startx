# Function bugs

Defects in executable logic — a function computes or decides the wrong thing.
Register: [`bugs.md`](bugs.md). Entry template: [`../README.md`](../README.md#6-how-to-work-this-folder).

Contents: [B2](#b2) · [B3](#b3) · [B15](#b15) · [B16](#b16) · [B17](#b17) · [B18](#b18) ·
[B19](#b19) · [B20](#b20) · [B21](#b21) · [B27](#b27)

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
