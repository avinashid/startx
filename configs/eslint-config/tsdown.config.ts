import { defineConfig } from "tsdown";
import { baseConfig } from "tsdown-config";

export default defineConfig({
  ...baseConfig,
	unbundle: false,
	clean:false,
  entry: [
    "./src/**/*.ts",
  ],
});
