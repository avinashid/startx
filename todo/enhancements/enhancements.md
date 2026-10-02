# Enhancement register — ROOT

Improvements to things that **already exist**. If it doesn't exist yet, it's a
[feature](../features/features.md). If it's broken, it's a [bug](../bugs/bugs.md).

- **Next free ID:** `E19`
- **Open:** 15 · **In progress:** 0 · **Done:** 3

Conventions and the entry template are in [`../README.md`](../README.md#6-how-to-work-this-folder).

---

## CLI — [`cli-enhancements.md`](cli-enhancements.md)

| ID | Title | Value | Effort | Status |
|---|---|---|---|---|
| E1 | Test suite for `startx-cli` — snapshot the emitted tree | **high** | M | open |
| E3 | Integrity check: every `FileCheck` / `DepCheck` key must resolve | **high** | S | open |
| E4 | Register packages created outside the workspace globs | med | S | open |
| E5 | Non-interactive mode — a flag for every prompt | med | M | open |
| E6 | Typed CLI errors and meaningful exit codes | low | S | open |
| E11 | Publish with npm provenance | med | S | open |
| E12 | Skip closure dependencies that already exist instead of prompting for each | med | S | open |
| E13 | `package new <name>` should not prompt for a name it was given | low | S | open |
| E16 | `init` shows its version and warns when a newer startx is published | med | S | done |

## Templates — [`template-enhancements.md`](template-enhancements.md)

| ID | Title | Value | Effort | Status |
|---|---|---|---|---|
| E2 | Promote accumulating lint warnings to errors | **high** | S | open |
| E7 | Shared env coercion helpers in `@repo/env` | med | S | open |
| E8 | Unit tests for the pure template logic | med | M | open |
| E9 | Revisit `typecheck.dependsOn: ["build"]` in `turbo.json` | med | S | open |
| E10 | Document the tag model in the user-facing README | med | S | open |
| E14 | The `cli` app template has no `bin` entry | low | S | open |
| E15 | Emit source maps for bundled apps so a crash is readable | med | S | open |
| E17 | `@db/sqlite` on drizzle over the built-in `node:sqlite`, without the native `better-sqlite3` | med | M | done |
| E18 | `web-client` on React Router 8 (latest) and React 19.3 | med | S | done |

Effort: **S** ≈ under an hour · **M** ≈ half a day · **L** ≈ multi-day.

---

## Why E1 and E3 come first

B13–B21 were nine generator defects — the CLI emitting subtly wrong output that nobody notices
until a scaffolded project misbehaves days later. They are fixed now, but there is still **no test
that runs `startx init` and looks at the result**.

E1 and E3 together would have caught B13, B14, B15, B16, B17 and B19 automatically. That is not a
retrospective argument: the audit that closed them immediately turned up B34–B42, including two P0s
(B34, B37) of exactly the same shape — wrong output, emitted silently, invisible to CI. The pattern
repeats because nothing pins it. These remain the highest-leverage work in this folder, and E3 in
particular is about an hour's work.
