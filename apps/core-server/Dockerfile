FROM node:24-alpine AS base
RUN apk add --no-cache git \
        && corepack enable \
        && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --parents apps/*/package.json ./
COPY --parents packages/*/package.json ./
COPY --parents configs/*/package.json ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY apps/core-server/ ./apps/core-server/
COPY packages ./packages
COPY configs ./configs
COPY turbo.json ./

# Build the required packages
RUN pnpm build:web

# --- Final production image ---
FROM node:24-alpine

WORKDIR /app

# Copy built server dist
COPY --from=builder /app/apps/core-server/dist ./
EXPOSE 3000

CMD ["node", "./index.mjs"]
