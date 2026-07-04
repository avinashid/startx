# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app

FROM base AS builder

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --parents apps/web-client/package.json ./
COPY --parents packages/common/package.json ./
COPY --parents packages/ui/package.json ./
COPY --parents configs/*/package.json ./

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY apps/web-client/ ./apps/web-client/
COPY packages/common ./packages/common
COPY packages/ui ./packages/ui
COPY configs ./configs
COPY turbo.json ./

# Build the required packages with Turbo cache mounted
RUN --mount=type=cache,id=turbo,target=/app/.turbo/cache,sharing=locked \
    pnpm build --filter=web-client

# --- Final production image ---
FROM nginx:stable-alpine


# Copy built server dist
COPY --from=builder /app/apps/web-client/build/client /usr/share/nginx/html
COPY --from=builder /app/apps/web-client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
