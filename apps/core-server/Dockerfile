# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --parents apps/core-server/package.json ./
COPY --parents packages/*/package.json ./
COPY --parents packages/*/*/package.json ./
COPY --parents configs/*/package.json ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY apps/core-server/ ./apps/core-server/
COPY packages ./packages
COPY configs ./configs
# COPY assets ./assets
COPY turbo.json ./

# Build the required packages with Turbo cache mounted
RUN --mount=type=cache,id=turbo,target=/app/.turbo/cache,sharing=locked \
    pnpm build --filter=core-server

# --- Final production image ---
FROM node:24-alpine

WORKDIR /app

# The build writes dist/package.json pinning the bundle's externals (runtimeDependencies in
# tsdown.config.ts) to the lockfile's versions. Install exactly those, then add the bundle.
COPY --from=builder /app/apps/core-server/dist/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/apps/core-server/dist ./
EXPOSE 3000

# Liveness only: /ready fails while Redis is down, and a restart does not bring Redis back. Point the
# orchestrator's readiness probe at /ready instead. busybox wget ships in the alpine image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1

CMD ["node", "./index.mjs"]
