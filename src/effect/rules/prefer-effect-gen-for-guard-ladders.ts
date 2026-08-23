import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

const LADDER_THRESHOLD = 3;

/** Whether this call is an Effect combinator chained in the flatMap/map ladder family. */
function isEffectLadderCombinator(node: ESTree.CallExpression): boolean {
	const callee = node.callee;
	if (callee.type !== "MemberExpression" || callee.computed) return false;
	if (callee.object.type !== "Identifier" || callee.object.name !== "Effect") return false;
	const name = callee.property.type === "Identifier" ? callee.property.name : "";
	return name === "flatMap" || name === "andThen" || name === "tap";
}

/**
 * Long Effect.flatMap ladders read as callback pyramids; Effect.gen renders the
 * same program as straight-line validation.
 */
export const preferEffectGenForGuardLaddersRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Suggest Effect.gen when a function chains several Effect.flatMap/andThen/tap combinators instead of reading as straight-line code.",
		},
		messages: {
			ladder:
				"This function chains {{count}} Effect ladder combinators. Rewrite with `Effect.gen` + `yield*` so the guard sequence reads top-to-bottom.",
		},
	},
	createOnce(context) {
		const counts = new Map<ESTree.Node, number>();
		const reported = new Set<ESTree.Node>();
		const enclosingFunction = (node: ESTree.Node): ESTree.Node | undefined => {
			let current: ESTree.Node | null | undefined = node.parent;
			while (current !== undefined && current !== null && current.type !== "Program") {
				if (
					current.type === "FunctionDeclaration" ||
					current.type === "FunctionExpression" ||
					current.type === "ArrowFunctionExpression"
				) {
					return current;
				}
				current = current.parent;
			}
			return undefined;
		};
		return {
		before() {
			if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			counts.clear();
			reported.clear();
		},
			CallExpression(node) {
				if (!isEffectLadderCombinator(node)) return;
				const owner = enclosingFunction(node);
				if (owner === undefined) return;
				const next = (counts.get(owner) ?? 0) + 1;
				counts.set(owner, next);
				if (next >= LADDER_THRESHOLD && !reported.has(owner)) {
					reported.add(owner);
					context.report({ node: owner, messageId: "ladder", data: { count: String(next) } });
				}
			},
		};
	},
});
