import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function isConstAssertion(type: ESTree.TSType): boolean {
	return (
		type.type === "TSTypeReference" &&
		type.typeName.type === "Identifier" &&
		type.typeName.name === "const"
	);
}

function hasAdjacentSafetyComment(context: unknown, node: ESTree.Node): boolean {
	const sourceCode = (context as { sourceCode: { getCommentsBefore(n: ESTree.Node): Array<{ value: string }> } }).sourceCode;
	return sourceCode
		.getCommentsBefore(node)
		.some((comment) => /\bSAFETY\s*:/u.test(comment.value));
}

interface CastWrapperMatch {
	name: string;
}

/** Whether a function-like body consists solely of returning an as-cast — a laundering wrapper. */
function isSoleReturnOfAssertion(body: ESTree.Node | null | undefined): boolean {
	if (body === null || body === undefined) return false;
	if (body.type === "BlockStatement") {
		if (body.body.length !== 1) return false;
		const only = body.body[0];
		return only?.type === "ReturnStatement" && only.argument?.type === "TSAsExpression";
	}
	return body.type === "TSAsExpression";
}

/**
 * Type assertions erase evidence. `as const` is exempt, and a `// SAFETY:`
 * comment documents the rare verified invariant. Wrapper functions that exist
 * only to perform a cast are laundering, not narrowing.
 */
export const noReinterpretCastRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow type reinterpretation via `as`; absence must be modeled by the type system, with SAFETY-commented exceptions.",
		},
		messages: {
			noReinterpret:
				"Type assertion discards type evidence. Narrow with discriminants/`in` checks or a type predicate instead; if the engine's types genuinely cannot express the shape, justify with a `// SAFETY:` comment directly above.",
			noLaundering:
				"`{{name}}` exists only to perform a type assertion — a laundering wrapper that hides the cast from review and tooling. Inline the narrowing behind a real type predicate instead.",
		},
	},
	createOnce(context) {
		return {
			TSAsExpression(node) {
				if (isConstAssertion(node.typeAnnotation)) return;
				if (hasAdjacentSafetyComment(context, node)) return;
				context.report({ node, messageId: "noReinterpret" });
			},
			TSTypeAssertion(node) {
				if (hasAdjacentSafetyComment(context, node)) return;
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
