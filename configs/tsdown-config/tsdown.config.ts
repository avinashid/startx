import { defineConfig } from "tsdown";
import { baseConfig } from "./src/config/tsdown.base";

export default defineConfig({
  ...baseConfig,
  entry: ["./src/index.ts"],
});
