# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --parents apps/queue-worker/package.json ./
COPY --parents packages/*/package.json ./
COPY --parents packages/*/*/package.json ./
COPY --parents configs/*/package.json ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY apps/queue-worker/ ./apps/queue-worker/
COPY packages ./packages
COPY configs ./configs
# COPY assets ./assets
COPY turbo.json ./

# Build the required packages with Turbo cache mounted
RUN --mount=type=cache,id=turbo,target=/app/.turbo/cache,sharing=locked \
    pnpm build --filter=queue-worker

# --- Final production image ---
FROM node:24-alpine

WORKDIR /app

# The build writes dist/package.json pinning the bundle's externals (runtimeDependencies in
# tsdown.config.ts) to the lockfile's versions. Install exactly those, then add the bundle.
COPY --from=builder /app/apps/queue-worker/dist/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/apps/queue-worker/dist ./
# Bull Board is off outside development and binds 127.0.0.1 by default. To reach it from outside the
# container set BULL_BOARD_ENABLED=true and BULL_BOARD_HOST=0.0.0.0, behind an authenticating proxy.
EXPOSE 2866

CMD ["node", "./index.mjs"]
