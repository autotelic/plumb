import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function declaredStatement(statement: ESTree.Statement): ESTree.Node | null {
	return statement.type === "ExportNamedDeclaration" ||
		statement.type === "ExportDefaultDeclaration"
		? (statement.declaration ?? null)
		: statement;
}

/** True for a heritage clause referencing Brand.Brand (any ESTree spelling). */
function isBrandBrandReference(
	expression: ESTree.TSTypeName | ESTree.Expression | ESTree.PrivateIdentifier,
): boolean {
	if (expression.type === "TSQualifiedName") {
		return (
			expression.left.type === "Identifier" &&
			expression.left.name === "Brand" &&
			expression.right.type === "Identifier" &&
			expression.right.name === "Brand"
		);
	}
	if (expression.type === "MemberExpression") {
		return (
			expression.object.type === "Identifier" &&
			expression.object.name === "Brand" &&
			expression.property.type === "Identifier" &&
			expression.property.name === "Brand"
		);
	}
	return false;
}

/** Opaque brand interfaces hide their payload behind casts; carry the payload in the brand. */
export const preferPayloadBrandRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Prefer payload-carrying brands (type X = Base & Brand.Brand<\"X\">) over opaque brand interfaces so the payload stays recoverable without type assertions.",
		},
		messages: {
			opaqueBrand:
				"Opaque brand interface `{{name}}` hides its payload behind casts. Carry the payload in the brand instead: `type {{name}} = Base & Brand.Brand<\"{{name}}\">` with a cast-free `un{{name}}` accessor.",
		},
	},
	createOnce(context) {
		return {
			Program(node) {
				for (const statement of node.body) {
					const declaration = declaredStatement(statement);
					if (declaration?.type !== "TSInterfaceDeclaration") continue;
					const heritages = declaration.extends ?? [];
					if (heritages.length !== 1) continue;
					if (!isBrandBrandReference(heritages[0]!.expression)) continue;
					context.report({
						node: declaration.id,
						messageId: "opaqueBrand",
						data: { name: declaration.id.name },
					});
				}
			},
		};
	},
});
