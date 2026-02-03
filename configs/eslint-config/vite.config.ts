import { defineConfig, mergeConfig } from "vite";
import vitestConfig from "vitest-config/node";

export default mergeConfig(defineConfig({}), vitestConfig);
