# Stage 1: Build the application
FROM node:22.7-alpine AS builder

# Install pnpm globally
RUN npm install -g pnpm

# Set the working directory in the container
WORKDIR /app

# Copy the monorepo root package.json and pnpm-lock.yaml to install dependencies
COPY package.json  ./

# Copy the pnpm workspace configuration
COPY pnpm-workspace.yaml ./

# Copy the entire monorepo to the container
COPY . .

# Install dependencies for the monorepo, including shared packages
RUN pnpm install

# Generate the Schema
RUN pnpm -r db:push

# Build TypeScript code for all packages
RUN pnpm build --filter=core-server --filter=admin-panel


# Stage 2: Create the production image
FROM node:22.7-alpine

# Install pnpm globally
RUN npm install -g pnpm

# Set the working directory in the container
WORKDIR /app

# Copy necessary files from builder stage
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/core-server/dist /app/apps/core-server/dist
COPY --from=builder /app/apps/admin-panel/dist /app/apps/core-server/dist/frontend
COPY --from=builder /app/apps/core-server/package.json ./apps/core-server/package.json
COPY --from=builder /app/packages/typescript-config ./packages/typescript-config
COPY --from=builder /app/packages/eslint-config ./packages/eslint-config
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/packages/redis ./packages/redis
COPY --from=builder /app/packages/mail ./packages/mail
COPY --from=builder /app/packages/lib ./packages/lib
COPY --from=builder /app/packages/common ./packages/common


# Install production dependencies
RUN pnpm install --prod --frozen-lockfile


# Expose the port that the app will run on
EXPOSE 3000


# Start the application
CMD ["node","--conditions=production", "/app/apps/core-server/dist/index.js"]