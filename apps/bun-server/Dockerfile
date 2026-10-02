# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --parents apps/bun-server/package.json ./
COPY --parents packages/*/package.json ./
COPY --parents packages/*/*/package.json ./
COPY --parents configs/*/package.json ./

# Not --ignore-scripts: the root `bun` devDependency's postinstall (allowed in pnpm-workspace.yaml)
# is what puts the bun binary the build runs on node_modules/.bin.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY apps/bun-server/ ./apps/bun-server/
COPY packages ./packages
COPY configs ./configs
COPY turbo.json ./

RUN --mount=type=cache,id=turbo,target=/app/.turbo/cache,sharing=locked \
    pnpm build --filter=bun-server

# --- Final production image ---
# `bun build` inlines every dependency, so the runtime image needs only the bundle.
FROM oven/bun:1-alpine

WORKDIR /app
ENV NODE_ENV=production BUN_SERVER_PORT=3002

COPY --from=builder --chown=bun:bun /app/apps/bun-server/dist ./
USER bun
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${BUN_SERVER_PORT}/health" || exit 1

CMD ["bun", "index.js"]
