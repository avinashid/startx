import { defineConfig } from "tsdown";
export const baseConfig = defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  target: "es2022",
  sourcemap: false,
  minify: true,
  treeshake: true,
	unbundle: true,
  shims: true,
  external: [/^@unrs\//],
});
