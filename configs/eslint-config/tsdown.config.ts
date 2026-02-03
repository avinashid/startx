import { defineConfig } from "tsdown";
import { baseConfig } from "tsdown-config";

export default defineConfig({
  ...baseConfig,
  entry: [
    "./src/*.ts",
    "./src/configs/*.ts",
    "./src/rules/*.ts",
    "./src/utils/*.ts",
  ],
});
