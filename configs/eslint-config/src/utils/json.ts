import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

export const isJsonParseCall = (node: TSESTree.CallExpression) =>
	node.callee.type === AST_NODE_TYPES.MemberExpression &&
	node.callee.object.type === AST_NODE_TYPES.Identifier &&
	node.callee.object.name === 'JSON' &&
	node.callee.property.type === AST_NODE_TYPES.Identifier &&
	node.callee.property.name === 'parse';

export const isJsonStringifyCall = (node: TSESTree.CallExpression) => {
	const parseArg = node.arguments?.[0];
	return (
		parseArg !== undefined &&
		parseArg.type === AST_NODE_TYPES.CallExpression &&
		parseArg.callee.type === AST_NODE_TYPES.MemberExpression &&
		parseArg.callee.object.type === AST_NODE_TYPES.Identifier &&
		parseArg.callee.object.name === 'JSON' &&
		parseArg.callee.property.type === AST_NODE_TYPES.Identifier &&
		parseArg.callee.property.name === 'stringify'
	);
};
