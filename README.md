# startx

> Scaffold a production-ready TypeScript monorepo in minutes.

**Requirements:** Node.js ≥ 22 · pnpm · Turborepo (installed automatically)

---

## Quick Start

```bash
npx startx init
```

Or install globally and reuse:

```bash
npm install -g startx
startx init
```

---

## Commands

| Command | What it does |
|---------|--------------|
| `startx init [name]` | Create a new monorepo from scratch |
| `startx package list` | Browse all available template apps, packages, and configs |
| `startx package add [name]` | Copy a template app or package into the current monorepo |
| `startx package new [name]` | Create a blank workspace package from scratch |

---

## `startx init`

Creates a complete monorepo workspace interactively.

**Options**

| Flag | Description |
|------|-------------|
| `-d, --dir <path>` | Output directory (defaults to `./<projectName>`) |

**Interactive prompts**

1. **Project name** — npm package name for the workspace root.
2. **Select apps** — One or more apps to include (checkbox list).
3. **Select configs** — Optional shared config packages (ESLint, TypeScript, Vitest, tsdown).
4. **Select packages** — Shared libraries compatible with your selected apps.
5. **Formatter** — `prettier + biome` (both) or `prettier` only.

After answering all prompts, the CLI writes the full workspace. No install is run automatically — finish setup with:

```bash
cd <projectName>
pnpm install
```

---

## `startx package list`

Prints all apps, packages, and configs available in the template, grouped by type.

```bash
startx package list
```

---

## `startx package add`

Copies a template app or package into the current monorepo.

```bash
startx package add [packageName] [options]
```

**Options**

| Flag | Description |
|------|-------------|
| `-n, --name <name>` | Override the destination name (e.g. copy `core-server` as `api-v2`) |
| `--eslint / --no-eslint` | Force ESLint on or off for this package |
| `--no-install` | Skip running the package manager after adding missing root dependencies |

**What happens**

1. Prompts to select the template source if not passed as an argument.
2. Asks for a new name — defaults to the template name, so you can clone `core-server` as `api-v2` or `@db/drizzle` as `@db/analytics`.
3. Detects what is installed in the workspace root (biome, prettier, eslint, vitest, tsdown) and applies matching config files and scripts automatically.
4. Checks for any workspace-root dependencies the package needs that are missing — offers to add and install them.
5. Prompts before overwriting if the destination path already exists.

**Example**

```bash
# Add core-server under a new name
startx package add core-server --name api-v2

# Add @db/drizzle as a new analytics DB package
startx package add @db/drizzle -n @db/analytics
```

---

## `startx package new`

Creates a blank package from scratch, auto-configured for the current workspace.

```bash
startx package new [packageName] [options]
```

**Options**

| Flag | Description |
|------|-------------|
| `-d, --dir <path>` | Custom destination path relative to workspace root |
| `--eslint / --no-eslint` | Force ESLint on or off |
| `--no-install` | Skip running the package manager |

**What gets created**

| File | Condition |
|------|-----------|
| `package.json` | Always — includes `typecheck` and `clean` scripts |
| `src/index.ts` | Always — empty export |
| `tsconfig.json` | Always — extends `typescript-config/tsconfig.node.json` |
| `eslint.config.ts` | If ESLint is detected in workspace root |
| `vitest.config.ts` | If vitest is detected in workspace root |

Scripts added to `package.json`:

- `lint` / `lint:fix` — if ESLint detected
- `test` — if vitest detected

**Example**

```bash
# Create @repo/analytics package
startx package new @repo/analytics

# Create in a custom path
startx package new my-utils --dir packages/internal/my-utils
```

---

## Available Templates

### Apps

| Name | Description |
|------|-------------|
| `core-server` | Express.js REST API server |
| `web-client` | React Router v7 single-page app |
| `cli` | Commander.js CLI application |
| `queue-worker` | Background job processor |

### Packages

| Name | Requires | Description |
|------|----------|-------------|
| `@repo/env` | backend | Environment variable validation with Zod |
| `@repo/lib` | backend | Auth, file system, hashing, sessions, events, and more |
| `@repo/logger` | backend | Structured logging |
| `@repo/mail` | backend | Email sending via Nodemailer |
| `@repo/redis` | backend | Redis client and session support |
| `@repo/model` | node | Shared Drizzle model definitions |
| `@repo/common` | node | Common shared utilities |
| `@db/drizzle` | backend | Drizzle ORM with PostgreSQL |
| `@db/sqlite` | backend | Drizzle ORM with SQLite |
| `ui` | frontend | React component library |
| `queue` | node | Job queue |
| `aix` | node | AI/ML utilities |

### Configs

| Name | Description |
|------|-------------|
| `typescript-config` | Shared `tsconfig` base files |
| `eslint-config` | Shared ESLint flat-config rules (TypeScript, imports, unicorn) |
| `vitest-config` | Shared Vitest configuration |
| `tsdown-config` | Shared tsdown build configuration |

---

## What Gets Generated

### By `startx init`

| Path | Description |
|------|-------------|
| `package.json` | Workspace root — name, scripts, and deps filtered to your selections |
| `pnpm-workspace.yaml` | Declares workspace package globs |
| `turbo.json` | Turborepo pipeline definition |
| `.vscode/settings.json` | Format on save + lint-fix on save, set to your chosen formatter |
| `.vscode/extensions.json` | Recommends ESLint + Biome or Prettier extension |
| `biome.json` | Biome configuration (only when Biome selected) |
| `.prettierrc.cjs` | Prettier configuration |
| `eslint.config.ts` | Root-level ESLint ignore list |
| `<app>/eslint.config.ts` | Per-package ESLint config extending shared rules |
| `<app>/vitest.config.ts` | Per-package Vitest config (if vitest selected) |
| `_gitignore` → `.gitignore` | Standard Node/TypeScript ignores |

The `.vscode/` files are committed so anyone who clones the generated repo gets format-on-save and lint-fix-on-save in VS Code without any manual setup.

### By `startx package add` / `startx package new`

Same file set as the source template for `add`. For `new`: `package.json`, `src/index.ts`, `tsconfig.json`, and conditionally `eslint.config.ts` / `vitest.config.ts` based on what is installed in the workspace.
