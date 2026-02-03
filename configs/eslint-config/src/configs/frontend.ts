import { fixupPluginRules } from "@eslint/compat";
import { baseConfig } from "./base.js"; // Adjust path as needed
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export const frontendConfig = tseslint.config(
  ...baseConfig,

  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/storybook-static/**",
      "**/*.snap",
      "**/*.d.ts",
      "vite.config.ts",
    ],
  },

  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat["jsx-runtime"],

  {
    files: ["**/*.tsx", "**/*.jsx"],
    plugins: {
      "react-hooks": fixupPluginRules(reactHooksPlugin as any),
      "jsx-a11y": fixupPluginRules(jsxA11yPlugin),
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,

      // --- React Hooks Specifics ---
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // --- Accessibility Specifics ---
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      // Disable legacy rule that conflicts with modern HTML5
      "jsx-a11y/no-onchange": "off",
    },
  }
);
