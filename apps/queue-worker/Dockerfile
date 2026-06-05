# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --parents apps/*/package.json ./
COPY --parents packages/*/package.json ./
COPY --parents packages/*/*/package.json ./
COPY --parents configs/*/package.json ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY apps/queue-worker/ ./apps/queue-worker/
COPY packages ./packages
COPY configs ./configs
COPY assets ./assets
COPY turbo.json ./

# Build the required packages with Turbo cache mounted
RUN --mount=type=cache,id=turbo,target=/app/.turbo/cache \
    pnpm build --filter=queue-worker

# --- Final production image ---
FROM node:24-alpine

WORKDIR /app

# Install external dependencies locally
RUN npm install sharp @bull-board/api @bull-board/ui @bull-board/express

# Copy built server dist
COPY --from=builder /app/apps/queue-worker/dist ./
EXPOSE 2866

CMD ["node", "./index.mjs"]
