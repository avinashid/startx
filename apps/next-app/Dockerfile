# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --parents apps/next-app/package.json ./
COPY --parents packages/ui/package.json ./
COPY --parents configs/*/package.json ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --ignore-scripts

COPY apps/next-app/ ./apps/next-app/
COPY packages/ui ./packages/ui
COPY configs ./configs
COPY turbo.json ./

ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,id=turbo,target=/app/.turbo/cache,sharing=locked \
    pnpm build --filter=next-app

# --- Final production image ---
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0

# output: "standalone" traces exactly the files the server needs, laid out from the workspace root.
# Static assets are not part of the trace; they go next to the app's server.js.
COPY --from=builder --chown=node:node /app/apps/next-app/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/next-app/.next/static ./apps/next-app/.next/static

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "apps/next-app/server.js"]
