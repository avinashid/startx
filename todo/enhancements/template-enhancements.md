# Template enhancements

Improvements to the template apps, packages and shared configs — the code that gets copied into
every scaffolded project.
Register: [`enhancements.md`](enhancements.md).

Contents: [E2](#e2) · [E7](#e7) · [E8](#e8) · [E9](#e9) · [E10](#e10)

---

## E2

### E2 · Promote accumulating lint warnings to errors

- **Status:** open · **Value:** high · **Effort:** S
- **Area:** `configs/eslint-config`

**Today** — `turbo lint` reports roughly **90 warnings** and zero errors. Warnings don't fail
anything, so they accumulate. Seven of them have already been promoted to build-breaking
`TS6133` errors by `tsc` — that's [B12.4](../bugs/type-bugs.md#b124), which only exists because the
warnings were ignored long enough to matter.

Current distribution:

| Rule | ~count | Assessment |
|---|---|---|
| `@typescript-eslint/naming-convention` | ~25 | Mostly false positives: Tailwind class keys (`px-3 py-2`), CSS custom properties (`--sidebar-width`), size variants (`icon-sm`) |
| `@typescript-eslint/no-explicit-any` + `no-unsafe-*` | ~30 | Real, concentrated in `@repo/lib` and `ui` |
| `unused-imports/no-unused-vars` | ~7 | **Real, and already breaking typecheck** |
| `react-hooks/exhaustive-deps` | 3 | Real, in `ui` |
| `jsx-a11y/*` | 2 | Real, in `ui` |
| Unused `eslint-disable` directives | 4 | Trivially removable |
| `eqeqeq` | 1 | Real |

**What to do** — Not a blanket promotion; that would fail the build on ~90 sites at once.

1. **`unused-imports/no-unused-vars` → `error`** immediately. It is already breaking `tsc`, so the
   only new information is *when* you find out.
2. **Fix and remove the 4 unused `eslint-disable` directives** and the single `eqeqeq` site.
3. **Scope `naming-convention`** so object literal properties are exempt in `.tsx` files, or add a
   `filter` for kebab-case and CSS-variable keys. Roughly a quarter of the noise disappears and the
   rule starts meaning something again.
4. **Cap `no-explicit-any`** rather than fixing all 30 at once: set it to `error` with a per-file
   `eslint-disable` in the worst offenders, then burn them down. A warning nobody acts on is worse
   than no rule.
5. **`react-hooks/exhaustive-deps` → `error`** — these are genuine stale-closure risks in
   `use-debounce.tsx:10` and `multiple-select.tsx:272`.

Add `--max-warnings=0` to the `lint` script only after steps 1–4 land.

**Done when** — `turbo lint` reports zero warnings, and new ones fail CI.

---

## E7

### E7 · Shared env coercion helpers in `@repo/env`

- **Status:** open · **Value:** medium · **Effort:** S
- **Area:** `packages/@repo/env`

**Today** — Every package writes its own Zod schema for environment variables, and at least one got
it wrong in a way that silently inverts behaviour: [B6](../bugs/runtime-bugs.md#b6), where
`z.coerce.boolean()` makes the string `"false"` evaluate to `true`.

`z.coerce.boolean()` is `Boolean(value)`. Environment variables are always strings. **Every non-empty
string is truthy.** This will recur every time someone adds a boolean flag.

**What to build** — Export typed helpers from `@repo/env` and use them everywhere:

```ts
export const envBool = (def = false) =>
  z
    .enum(["true", "false", "1", "0"])
    .default(def ? "true" : "false")
    .transform((v) => v === "true" || v === "1");

export const envPort = () => z.coerce.number().int().min(1).max(65535);

export const envUrl = () => z.string().url();
```

`envBool` deliberately excludes `""` from the enum: a blank env var is treated as a misconfiguration
and rejected rather than silently read as `false`.

Then sweep the repo for `z.coerce.boolean()` and replace. Add an `eslint-config` rule banning
`z.coerce.boolean` outright — the repo already ships 10 custom rules, so the machinery exists.

While here, two related items in the same package:
- `PORT` is `z.string()` in `default-env.ts:9`, so `app.listen(ENV.PORT)` passes a string. It works,
  but `envPort()` would validate it.
- `CLIENT_URL`, `SERVER_URL` and `CORS_URL` are plain `z.string()` with localhost defaults, so a
  deployment that forgets to set them gets a silently wrong CORS allowlist rather than an error.
  Consider requiring them when `NODE_ENV !== "development"`.

There is now a second, concrete reason to build this: [B41](../bugs/runtime-bugs.md#b41). Fixing B6
and hardening the cookie module were done independently, and the two landed on incompatible boolean
dialects — `@repo/redis` accepts a strict, case-sensitive `z.enum(["true","false","1","0"])`, while
`@repo/lib` accepts a lenient, case-insensitive set that also takes `yes`/`no`/`on`/`off`, and the
two throw different error types. That divergence is the predictable result of having no shared
helper, and this enhancement is the fix for it.

**Done when** — No `z.coerce.boolean()` remains, `REDIS_CLUSTER_MODE=false` means false, and every
boolean env var in the template accepts the same spellings and fails the same way (closing B41).

---

## E8

### E8 · Unit tests for the pure template logic

- **Status:** open · **Value:** medium · **Effort:** M
- **Area:** `packages/@repo/lib`, `packages/common`

**Today** — 24 tests exist, all in `eslint-config`. Every shared library ships untested, including
several modules that are pure, dependency-free and trivially testable.

**Where the value is, in order**

| Module | File | Why it's first |
|---|---|---|
| `Paginator` | `@repo/lib/src/extra/pagination-module.ts` | Pure, takes user-controlled input, currently unvalidated ([B27](../bugs/function-bugs.md#b27)) |
| `Time` | `packages/common/src/time.ts` | Pure arithmetic; a unit confusion here already caused [B3](../bugs/function-bugs.md#b3) |
| `EncryptionModule` | `@repo/lib/src/encryption-module/` | Round-trip, tamper-detection, malformed-payload cases |
| `HashingModule` | `@repo/lib/src/hashing-module/` | Trivial, but pins the bcrypt cost factor |
| `FileHandler.handlePackageJson` | `startx-cli/src/utils/file-handler.ts` | Pure function, drives everything — see [E1](cli-enhancements.md#e1) |
| `ITokenModule` | `@repo/lib/src/token-module/` | Sign/verify/expiry/wrong-secret |

`Time` deserves a specific test given B3: assert `Time.minutes(5).seconds === 300` and
`Time.minutes(5).milliseconds === 300000`, so the two are visibly distinct in the test output.

The modules that need Redis (`OTPModule`, session) want `ioredis-mock` or a testcontainer — leave
those for a second pass.

**Done when** — Every pure module in `@repo/lib` and `packages/common` has a test file, and
`turbo test` runs more than 24 tests.

---

## E9

### E9 · Revisit `typecheck.dependsOn: ["build"]` in `turbo.json`

- **Status:** open · **Value:** medium · **Effort:** S
- **Area:** `turbo.json`

**Today**
```jsonc
"build":     { "dependsOn": ["lint", "^build"] },
"typecheck": { "dependsOn": ["^typecheck", "build"] },
```

Running `pnpm typecheck` therefore runs **lint and a full build of every package first** — including
a complete Vite/React Router production build of `web-client`, fonts and all. A cold
`turbo typecheck` takes **1m 46s**, the large majority of it spent building things typechecking does
not need.

It also means one package's broken lint config fails typecheck for the whole repo
([B8](../bugs/config-bugs.md#b8)), which conflates three independent signals into one.

**Why it's like this** — Presumably because packages export raw `.ts` via their `exports` maps, so
consumers typecheck against source, not `.d.ts`. In that arrangement `build` is genuinely not
required for `typecheck` — `^typecheck` alone is enough.

**What to do**

1. Drop `"build"` from `typecheck.dependsOn`, leaving `["^typecheck"]`.
2. Run `turbo typecheck` from clean and confirm nothing regresses. If something does, it will be a
   package that genuinely consumes built output — fix that package's `exports` instead of restoring
   the global dependency.
3. Drop `"lint"` from `build.dependsOn` too. Lint is a quality gate, not a build input; CI should run
   `turbo lint` as its own job. This also makes B8-style failures legible.

Expect `turbo typecheck` to drop to a few seconds warm.

**Done when** — `turbo typecheck` no longer triggers `build` or `lint`, and all three commands can
fail independently.

---

## E10

### E10 · Document the tag model in the user-facing README

- **Status:** open · **Value:** medium · **Effort:** S
- **Area:** `README.md`

**Today** — The root `README.md` documents the commands, the flags and the template catalogue
thoroughly. It says **nothing** about `gTags` / `iTags` / `tags` / `mode` / `requiredDeps` /
`ignore` — the mechanism that decides what actually gets generated.

That matters for two audiences:
- Anyone adding a template to this repo has to reverse-engineer the model from `init.ts`.
- Anyone debugging a surprising scaffold result (why did my frontend get `tsc --noEmit`?) has no
  documented model to reason against.

**What to write** — Port §2 of [`../README.md`](../README.md#2-the-orchestration-model) into the
user-facing README as a "How templates are selected" section: the six metadata fields, the
`entry.tags ⊆ currentTags` predicate, and the three lookup tables (`FileCheck`, `DepCheck`,
`scripts`). Add a worked example showing which tags a `core-server` + `web-client` workspace ends up
with.

Also fix two smaller README gaps while in there:
- The root `package.json` has an empty `"description"`, and no `homepage` or `bugs` fields — so the
  npm page shows no description. Tracked as [C5](../chores/chores.md#c5).
- The README's `startx package add` section documents `--no-install` as "skip running the package
  manager after adding missing root dependencies", which is accurate, but doesn't mention that
  `init` never installs at all. Worth stating once, prominently.

**Done when** — Someone can add a new template package correctly using only the README.

---

## E14

### E14 · The `cli` app template has no `bin` entry

- **Status:** open · **Value:** low · **Effort:** S
- **Area:** `apps/cli/package.json`

**Today** — The scaffolded CLI builds to `dist/index.mjs` and runs via `node dist/index.mjs`, but it declares no `bin`, so `pnpm link`, `npm i -g` and `npx` can't expose it as a command, which is the point of a CLI template. Found in: runtime smoke `tsk_jv5m7m9a`, 2026-10-01.

**Done when** — `apps/cli/package.json` carries `"bin": { "<name>": "./dist/index.mjs" }` with a shebang, and `handlePackageJson` keeps it (B16 already preserves `bin`).

---

## E15

### E15 · Emit source maps for bundled apps so a crash is readable

- **Status:** open · **Value:** med · **Effort:** S
- **Area:** `configs/tsdown-config`, app `tsdown.config.ts`

**Today** — core-server and queue-worker bundle every dependency into one file. When either crashes at boot, Node echoes the offending source line, which is several kilobytes of bundled code, and the stack points at `dist/index.mjs:781:2211`. Found in: runtime smoke `tsk_jv5m7m9a`, 2026-10-01.

**Done when** — Builds emit `sourcemap: true`, and `start` runs with `--enable-source-maps`, so a boot failure prints the original `src/` location.
