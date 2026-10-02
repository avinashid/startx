import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vitest/config";
import vitestConfig from "vitest-config/frontend";

// The `@/*` path from tsconfig.json, which Next resolves itself and vitest does not.
export default mergeConfig(vitestConfig, {
	resolve: { alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src") } },
});
