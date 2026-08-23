import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function isConstAssertion(type: ESTree.TSType): boolean {
	return (
		type.type === "TSTypeReference" &&
		type.typeName.type === "Identifier" &&
		type.typeName.name === "const"
	);
}

interface CommentLike {
	value: string;
}

/** Whether a function-like body consists solely of returning an as-cast. */
function isSoleReturnOfAssertion(body: ESTree.Node | null | undefined): boolean {
	if (body === null || body === undefined) return false;
	if (body.type === "BlockStatement") {
		if (body.body.length !== 1) return false;
		const only = body.body[0];
		return only?.type === "ReturnStatement" && only.argument?.type === "TSAsExpression";
	}
	return body.type === "TSAsExpression";
}

/** Whether the assertion node has an adjacent `// SAFETY:` justification. */
function hasAdjacentSafetyComment(sourceCode: { getCommentsBefore(n: ESTree.Node): Array<CommentLike> }, node: ESTree.Node): boolean {
	return sourceCode.getCommentsBefore(node).some((comment) => /\bSAFETY\s*:/u.test(comment.value));
}

/** Type assertions erase evidence; `as const` is exempt and `// SAFETY:` documents rare verified invariants. */
export const noReinterpretCastRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow type reinterpretation via `as`; absence must be modeled by the type system, with SAFETY-commented exceptions.",
		},
		messages: {
			noReinterpret:
				"Type assertion discards type evidence. Narrow with discriminants/`in` checks or a type predicate instead.",
			noLaundering:
				"`{{name}}` exists only to perform a type assertion — a laundering wrapper that hides the cast from review and tooling.",
		},
	},
	createOnce(context) {
		return {
			TSAsExpression(node) {
				if (isConstAssertion(node.typeAnnotation)) return;
				if (hasAdjacentSafetyComment(context.sourceCode, node)) return;
				context.report({ node, messageId: "noReinterpret" });
			},
			TSTypeAssertion(node) {
				if (hasAdjacentSafetyComment(context.sourceCode, node)) return;
				context.report({ node, messageId: "noReinterpret" });
			},
			FunctionDeclaration(node) {
				if (node.body !== null && isSoleReturnOfAssertion(node.body)) {
					context.report({ node, messageId: "noLaundering", data: { name: node.id?.name ?? "<anonymous>" } });
				}
			},
			ArrowFunctionExpression(node) {
				if (node.body.type === "TSAsExpression") {
					context.report({ node, messageId: "noLaundering", data: { name: "<arrow>" } });
				}
			},
		};
	},
});
