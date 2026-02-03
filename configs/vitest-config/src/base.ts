import { defineConfig } from "vitest/config";
import type { InlineConfig } from "vitest/node";

// Detect if we are running in "dev" mode (npm run test:dev)
const isDev = process.env.npm_lifecycle_event === "test:dev";
export const baseVitestConfig = (options: InlineConfig = {}) =>
  defineConfig({
    test: {
      silent: true,
      globals: true,

      // Smart Include/Exclude Logic (Shared)
      // Dev: Run TS source | Prod: Run compiled JS in dist
      include: isDev
        ? ["src/**/*.{test,spec}.{ts,tsx}"]
        : ["dist/**/*.{test,spec}.{js,mjs,cjs}"],
      exclude: isDev
        ? ["**/node_modules/**", "**/dist/**"]
        : ["**/node_modules/**", "**/src/**"],

      // Standardized Coverage Logic
      coverage:
        process.env.COVERAGE_ENABLED === "true"
          ? {
              enabled: true,
              provider: "v8",
              ...options.coverage,
            }
          : { enabled: false },

      // Merge whatever specific options are passed
      ...options,
    },
  });
