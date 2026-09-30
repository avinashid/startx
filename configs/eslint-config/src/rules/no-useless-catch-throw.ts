import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

export const NoUselessCatchThrowRule = ESLintUtils.RuleCreator.withoutDocs({
	name: "no-useless-catch-throw",
	meta: {
		type: "problem",
		docs: {
			description: "Disallow `try-catch` blocks where the `catch` only contains a `throw error`.",
		},
		messages: {
			noUselessCatchThrow: "Remove useless `catch` block.",
		},
		fixable: "code",
		schema: [],
	},
	defaultOptions: [],
	create(context) {
		return {
			CatchClause(node) {
				if (
					node.body.body.length === 1 &&
					node.body.body[0].type === AST_NODE_TYPES.ThrowStatement &&
					node.body.body[0].argument.type === AST_NODE_TYPES.Identifier &&
					node.param?.type === AST_NODE_TYPES.Identifier &&
					node.body.body[0].argument.name === node.param.name
				) {
					context.report({
						node,
						messageId: "noUselessCatchThrow",
						fix(fixer) {
							const tryStatement = node.parent;
							const tryBlock = tryStatement.block;
							const sourceCode = context.sourceCode;
							const tryBlockText = sourceCode.getText(tryBlock);
							const tryBlockTextWithoutBraces = tryBlockText.slice(1, -1).trim();
							const indentedTryBlockText = tryBlockTextWithoutBraces
								.split("\n")
								.map((line) => line.replace(/\t/, ""))
								.join("\n");
							return fixer.replaceText(tryStatement, indentedTryBlockText);
						},
					});
				}
			},
		};
	},
});
