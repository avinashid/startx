import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";
import { isJsonParseCall, isJsonStringifyCall } from "../utils/json.js";

export const NoJsonParseJsonStringifyRule = ESLintUtils.RuleCreator.withoutDocs({
	name: "no-json-parse-json-stringify",
	meta: {
		type: "problem",
		docs: {
			description:
				"Calls to `JSON.parse(JSON.stringify(arg))` must be replaced with `structuredClone(arg)`.",
		},
		schema: [],
		messages: {
			noJsonParseJsonStringify: "Replace with `structuredClone({{ argText }})`",
		},
		fixable: "code",
	},
	defaultOptions: [],
	create(context) {
		return {
			CallExpression(node) {
				// Must be JSON.parse(...)
				if (!isJsonParseCall(node)) return;

				const [inner] = node.arguments;

				// Must be JSON.stringify(...)
				if (
					!inner ||
					inner.type !== TSESTree.AST_NODE_TYPES.CallExpression ||
					!isJsonStringifyCall(inner)
				) {
					return;
				}

				if (inner.arguments.length !== 1) return;

				const arg = inner.arguments[0];
				if (!arg) return;

				const argText = context.sourceCode.getText(arg);

				context.report({
					node,
					messageId: "noJsonParseJsonStringify",
					data: { argText },
					fix: fixer => fixer.replaceText(node, `structuredClone(${argText})`),
				});
			},
		};
	},
});
