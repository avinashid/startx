# Feature register — ROOT

Things that **do not exist yet**. If it exists and could be better, it's an
[enhancement](../enhancements/enhancements.md). If it exists and is broken, it's a
[bug](../bugs/bugs.md).

- **Next free ID:** `F10`
- **Open:** 9 · **In progress:** 0 · **Done:** 0

Conventions and the entry template are in [`../README.md`](../README.md#6-how-to-work-this-folder).

---

## CLI — [`cli-features.md`](cli-features.md)

| ID | Title | Value | Effort | Status |
|---|---|---|---|---|
| F1 | `startx doctor` — validate an existing workspace | **high** | M | open |
| F2 | Generate a real `.env` during `init` | **high** | S | open |
| F3 | `startx package remove` | med | M | open |
| F6 | `startx update` — refresh templates in an existing workspace | med | L | open |
| F7 | `git init` and optional `pnpm install` after `init` | med | S | open |

## Templates — [`template-features.md`](template-features.md)

| ID | Title | Value | Effort | Status |
|---|---|---|---|---|
| F4 | Security middleware baked into `core-server` | **high** | S | open |
| F9 | Worked auth routes wired to the session module | **high** | M | open |
| F5 | Supported "serve the SPA from the API" mode | low | M | open |
| F8 | Named pnpm catalogs support | low | S | open |

Effort: **S** ≈ under an hour · **M** ≈ half a day · **L** ≈ multi-day.

---

## Sequencing note

**F2 and F4 are close to free and remove real first-run friction** — a scaffolded project currently
cannot boot without hand-editing `.env` ([B7](../bugs/config-bugs.md#b7)) and ships with no security
headers ([B28](../bugs/security-bugs.md#b28)).

**F1 (`startx doctor`) is the highest-value larger item.** Most of the P1 and P2 bugs in this repo
are things a validator would have caught in a generated workspace — missing `tsconfig.json`, a
`catalog:` that resolves to nothing, a `workspace:^` pointing at a directory that doesn't exist, a
frontend package with the wrong `typecheck` script. Building it doubles as a specification of what
"correctly generated" means.

**F6 (`startx update`) should wait.** It only makes sense once the generator's output is trustworthy
and [E1](../enhancements/cli-enhancements.md#e1) exists to prove it stays that way.
