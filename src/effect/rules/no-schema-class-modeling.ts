import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const BANNED = new Set(["Class", "TaggedClass"]);

function isBannedSchemaStatic(
	expression: ESTree.Expression | ESTree.TSTypeName | null | undefined,
): boolean {
	if (expression === null || expression === undefined) return false;
	return (
		expression.type === "MemberExpression" &&
		expression.object.type === "Identifier" &&
		expression.object.name === "Schema" &&
		expression.property.type === "Identifier" &&
		BANNED.has(expression.property.name)
	);
}

/** Schema.Class/TaggedClass must not be the default data-modeling pattern. */
export const noSchemaClassModelingRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Schema.Class and Schema.TaggedClass as default data-modeling patterns; model records with Schema.Struct plus a same-name interface, variants with Schema.TaggedUnion/TaggedStruct, and typed errors with Schema.TaggedError.",
		},
		messages: {
			schemaClass:
				"Do not introduce `Schema.{{name}}` as a data-modeling pattern. Model records with `Schema.Struct(...)` plus a same-name interface, tagged variants with `Schema.TaggedStruct`/`Schema.TaggedUnion`, and typed errors with `Schema.TaggedError`.",
		},
	},
	create(context) {
		const checkExpression = (callee: ESTree.Expression | null | undefined): void => {
			if (!isBannedSchemaStatic(callee)) return;
			if (callee === null || callee === undefined) return;
			const property = (callee as ESTree.MemberExpression)
				.property as ESTree.IdentifierName | ESTree.PrivateIdentifier;
			context.report({
				node: callee,
				messageId: "schemaClass",
				data: { name: property.name },
			});
		};
		return {
			CallExpression(node) {
				checkExpression(node.callee);
			},
			ClassDeclaration(node) {
				if (!isBannedSchemaStatic(node.superClass)) return;
				const property = (node.superClass as ESTree.MemberExpression)
					.property as ESTree.IdentifierName | ESTree.PrivateIdentifier;
				if (node.superClass === null) return;
				context.report({
					node: node.superClass,
					messageId: "schemaClass",
					data: { name: property.name },
				});
			},
		};
	},
});
