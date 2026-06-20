# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.0.8 --activate

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --parents apps/core-server/package.json ./
COPY --parents packages/*/package.json ./
COPY --parents packages/*/*/package.json ./
COPY --parents configs/*/package.json ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY apps/core-server/ ./apps/core-server/
COPY packages ./packages
COPY configs ./configs
COPY assets ./assets
COPY turbo.json ./

# Build the required packages with Turbo cache mounted
RUN --mount=type=cache,id=turbo,target=/app/.turbo/cache \
    pnpm build --filter=core-server

# --- Final production image ---
FROM node:24-alpine

WORKDIR /app

# Install external dependencies locally
RUN npm install sharp

# Copy built server dist
COPY --from=builder /app/apps/core-server/dist ./
EXPOSE 3000

CMD ["node", "./index.mjs"]
