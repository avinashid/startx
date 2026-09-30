# Agent skill

`SKILL.md` is a Claude Code skill: the checklist form of the root `AGENTS.md`, loaded on demand when
a task touches this monorepo's conventions.

Install it per-user or per-repo:

```bash
mkdir -p .claude/skills/startx && cp docs/agent-skill/SKILL.md .claude/skills/startx/
```

It is kept here rather than in `.claude/` so it is reviewable in the repo and survives a workspace
that has its own `.claude/` setup. `AGENTS.md` is the source of truth — if the two disagree,
`AGENTS.md` wins and this file needs updating.
