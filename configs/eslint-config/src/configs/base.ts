import js from "@eslint/js";
import { fixupPluginRules } from "@eslint/compat";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importPlugin from "eslint-plugin-import-x";
import lodashPlugin from "eslint-plugin-lodash";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";
import stylisticPlugin from "@stylistic/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import { localRulesPlugin } from "../plugin.js"; // Assuming this exists

export const baseConfig = tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "eslint.config.mjs",
      "tsup.config.ts",
      "jest.config.js",
      "cypress.config.js",
      "vite.config.ts",
      "vitest.config.ts",
			"tsdown.config.ts",
    ],
  },

  // 2. Base Configurations (Order matters)
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  // 3. Main Configuration (Node, Express, Shared Logic)
  {
    plugins: {
      // Compatibility fixups for plugins not yet strictly flat-config ready
      "unused-imports": fixupPluginRules(unusedImportsPlugin),
      "react-hooks": fixupPluginRules(reactHooksPlugin as any),
      lodash: fixupPluginRules(lodashPlugin),

      "@stylistic": stylisticPlugin as any,
      unicorn: unicornPlugin,
      react: reactPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // Combine globals for Monorepo (Node + Browser)
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        projectService: true, // Faster than 'project: true' for monorepos
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import-x/resolver-next": [createTypeScriptImportResolver()],
      react: {
        version: "detect",
      },
    },
    rules: {
      // ******************************************************************
      //                     Core Rules
      // ******************************************************************
      "no-void": ["error", { allowAsStatement: true }],
      "no-constant-binary-expression": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: "error",
      "object-shorthand": "error",
      "prefer-const": "error",

      // ID Denylist
      "id-denylist": [
        "error",
        "err",
        "cb",
        "callback",
        "any",
        "Number",
        "number",
        "String",
        "string",
        "Boolean",
        "boolean",
        "Undefined",
        "undefined",
      ],

      // ******************************************************************
      //                     TypeScript
      // ******************************************************************
      "@typescript-eslint/array-type": ["error", { default: "array-simple" }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/consistent-type-assertions": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-floating-promises": [
        "error",
        { ignoreVoid: true },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/return-await": ["error", "always"],
      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        { accessibility: "no-public" },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: ["camelCase"],
        },
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
        {
          selector: "variable",
          format: ["camelCase", "snake_case", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allowSingleOrDouble",
          trailingUnderscore: "allowSingleOrDouble",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "enumMember",
          format: ["UPPER_CASE", "PascalCase"],
        },
      ],
      "@typescript-eslint/no-restricted-types": [
        "error",
        {
          types: {
            Object: { message: "Use object instead", fixWith: "object" },
            String: { message: "Use string instead", fixWith: "string" },
            Boolean: { message: "Use boolean instead", fixWith: "boolean" },
            Number: { message: "Use number instead", fixWith: "number" },
            Symbol: { message: "Use symbol instead", fixWith: "symbol" },
            Function: {
              message:
                "The `Function` type accepts any function-like value. Define the explicit function shape.",
            },
          },
        },
      ],

      // ******************************************************************
      //                     Stylistic
      // ******************************************************************
      "@stylistic/member-delimiter-style": [
        "error",
        {
          multiline: { delimiter: "semi", requireLast: true },
          singleline: { delimiter: "semi", requireLast: false },
        },
      ],

      // ******************************************************************
      //                     Import X
      // ******************************************************************
      "import-x/no-cycle": ["error", { ignoreExternal: false, maxDepth: 3 }],
      "import-x/no-default-export": "warn",
      "import-x/no-duplicates": "error",
      "import-x/order": [
        "error",
        {
          alphabetize: { order: "asc", caseInsensitive: true },
          groups: [
            ["builtin", "external"],
            "internal",
            ["parent", "index", "sibling"],
            "object",
          ],
          "newlines-between": "always",
        },
      ],

      // ******************************************************************
      //                     Plugins
      // ******************************************************************
      "unused-imports/no-unused-imports":
        process.env.NODE_ENV === "development" ? "warn" : "error",

      "unicorn/no-unnecessary-await": "error",
      "unicorn/no-useless-promise-resolve-reject": "error",

      "lodash/path-style": ["error", "as-needed"],
      "lodash/import-scope": ["error", "method"],
    },
  },

  // 4. React Specific Overrides (Only for .tsx / .jsx files)
  {
    files: ["**/*.tsx", "**/*.jsx"],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat["jsx-runtime"],
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      "react/prop-types": "off", // Not needed with TypeScript
      "react/react-in-jsx-scope": "off", // Not needed in modern React
      "react/jsx-no-leaked-render": "error", // Security/Perf rule
    },
  },

  // 5. Test Overrides
  {
    files: ["test/**/*.ts", "**/__tests__/*.ts", "**/*.test.ts", "**/*.cy.ts"],
    rules: {
      "local-rules/no-plain-errors": "off",
      "@typescript-eslint/unbound-method": "off",
      "import-x/no-default-export": "off", // Tests often need default export for config or simply don't care
    },
  },

  // 6. Local Rules
  localRulesPlugin.configs.recommended,

  // 7. Prettier (Must be last to override stylistic rules)
  eslintConfigPrettier
);
