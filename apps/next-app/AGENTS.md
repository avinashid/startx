<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# next-app

The workspace root `AGENTS.md` holds the monorepo conventions (the gate, the catalog, shared packages);
this file only adds what is specific to this app.

- App Router under `src/app/`. A page is `src/app/<segment>/page.tsx`: file-system routing, unlike
  `web-client`.
- Workspace libraries ship TypeScript source, so each one the app imports goes in `transpilePackages`
  in `next.config.ts` (`@repo/ui` is already there).
- Components are server components unless the file starts with `"use client"`. Context providers
  (`@repo/ui/api`'s `QueryProvider`, the `ThemeProvider`) live in `src/app/providers.tsx` for that reason.
- Public configuration is `NEXT_PUBLIC_*`, read with literal property access in `src/config/env.ts`
  and inlined at build time. Never put a secret under that prefix.
- `output: "standalone"`: the Dockerfile ships `.next/standalone`, and `GET /api/health` is the
  liveness probe.
- Dev and start listen on port 3001; core-server owns 3000.
