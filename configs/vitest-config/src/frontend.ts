import { baseVitestConfig } from "./base.ts";

export default baseVitestConfig({
	environment: "jsdom",
	css: {
		modules: {
			classNameStrategy: "non-scoped",
		},
	},

	coverage: {
		reporter: ["text-summary", "lcov", "html"],
	},
});
