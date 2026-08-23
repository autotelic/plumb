import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

/** Whether the annotation references the Effect or Either channel (defect-capable). */
function returnsEffectOrFailChannel(node: ESTree.Node): boolean {
	const fn = node as unknown as { returnType?: { typeAnnotation?: ESTree.TSType } };
	const annotation = fn.returnType?.typeAnnotation;
	if (annotation === undefined) return false;
	const seen: Array<ESTree.TSType> = [annotation];
	while (seen.length > 0) {
		const type = seen.pop();
		if (type === undefined) continue;
		switch (type.type) {
			case "TSTypeReference": {
				const name = type.typeName;
				const head =
					name.type === "Identifier"
						? name.name
						: name.type === "TSQualifiedName"
							? // Leftmost namespace of Effect.Effect / Either.Right etc.
								(name.left.type === "Identifier" ? name.left.name : null)
							: null;
				if (head === "Effect" || head === "Either") {
					return true;
				}
				const args = (type as { typeArguments?: { params?: Array<ESTree.TSType> } }).typeArguments;
				if (args?.params !== undefined) seen.push(...args.params);
				break;
			}
			case "TSUnionType":
			case "TSIntersectionType":
				seen.push(...type.types);
				break;
			case "TSTupleType":
				for (const element of type.elementTypes) {
					const payload = (element as { elementType?: ESTree.TSType }).elementType ?? element;
					seen.push(payload as ESTree.TSType);
				}
				break;
			case "TSTypeOperator":
				seen.push(type.typeAnnotation);
				break;
			case "TSArrayType":
				seen.push(type.elementType);
				break;
			default:
				break;
		}
	}
	return false;
}

/**
 * Precondition violations are defects by doctrine: thrown directly they escape
 * the Cause, invisible to telemetry and supervisors.
 */
export const preferDieForPreconditionDefectsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"In Effect/Either-returning functions, raise precondition defects with Effect.die instead of a bare throw so they travel inside the Cause.",
		},
		messages: {
			bareThrow:
				"This bare throw escapes the Effect `Cause`. Raise the tagged defect with `Effect.die(new ...)` (or reclassify the case as a typed failure on the error channel) so supervisors and telemetry observe it.",
		},
	},
	createOnce(context) {
		const check = (node: ESTree.ThrowStatement): void => {
			const ancestors = context.sourceCode.getAncestors(node) as unknown as ReadonlyArray<ESTree.Node>;
			for (let index = ancestors.length - 1; index >= 0; index--) {
				const current = ancestors[index]!;
				if (current.type === "Program") break;
				if (
					current.type === "FunctionDeclaration" ||
					current.type === "FunctionExpression" ||
					current.type === "ArrowFunctionExpression"
				) {
					if (returnsEffectOrFailChannel(current)) context.report({ node, messageId: "bareThrow" });
					return;
				}
			}
		};
		return { 		before() {
			if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
		},
ThrowStatement: check };
	},
});
