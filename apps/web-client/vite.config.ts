import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { config } from "@dotenvx/dotenvx";
import { defineConfig } from "vite";
import path from "path";
export default defineConfig(() => {
	const envPath = path.resolve(process.cwd(), "../../.env");
	config({ path: envPath, quiet: true });

	const ENV = process.env;

	const env = Object.entries(ENV).reduce(
		(acc, [key, value]) => {
			if (!key.startsWith("VITE")) {
				return acc;
			}
			acc[`import.meta.env.${key}`] = JSON.stringify(value);
			return acc;
		},
		{} as Record<string, string>
	);

	return {
		plugins: [tailwindcss(), reactRouter()],
		resolve: {
			tsconfigPaths: true,
		},
		define: env,
	};
});
