import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { ancestorsOf } from "../../shared/ancestors.ts";

import { cast } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

const EQUALITY_OPERATORS = new Set(["==", "===", "!=", "!=="]);

/** Discriminant reader for engine nodes the typings leave loose. */
function typeOf(node: object): string {
	return cast<{ readonly type: string }>(node).type;
}

function isLiteral(node: object): boolean {
	if (typeOf(node) === "Literal") return true;
	if (typeOf(node) !== "TemplateLiteral") return false;
	return cast<{ readonly expressions: ReadonlyArray<object> }>(node).expressions.length === 0;
}

/** The compared operand of a literal equality test, rendered to source text. */
function comparedValue(sourceCode: import("@oxlint/plugins").SourceCode, test: object): string | undefined {
	if (typeOf(test) !== "BinaryExpression") return undefined;
	const shape = cast<{
		readonly operator?: unknown;
		readonly left: object;
		readonly right: object;
	}>(test);
	if (typeof shape.operator !== "string" || !EQUALITY_OPERATORS.has(shape.operator)) {
		return undefined;
	}
	if (isLiteral(shape.left)) return sourceCode.getText(cast<ESTree.Node>(shape.right));
	if (isLiteral(shape.right)) return sourceCode.getText(cast<ESTree.Node>(shape.left));
	return undefined;
}
/** Chained literal ternaries over one value re-implement `Match` without exhaustiveness checking. */
export const preferEffectMatchRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Prefer Match from effect for chained literal ternaries over the same value; the compiler then checks exhaustiveness instead of falling through silently.",
		},
		messages: {
			preferMatch:
				"This ternary chain re-implements pattern matching over literal comparisons. Use `Match.value` (or `Match.discriminate`) from `effect/Match` so exhaustiveness is checked by the compiler.",
		},
	},
	createOnce(context) {
		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			ConditionalExpression(node) {
				const parent = ancestorsOf(context.sourceCode, node)[0];
				if (parent !== undefined && typeOf(parent) === "ConditionalExpression") {
					// Report only the outermost link of the chain.
					return;
				}
				const compared = comparedValue(context.sourceCode, node.test);
				if (compared === undefined) return;
				let alternate: object = node.alternate as unknown as object;
				let literalChecks = 1;
				while (typeOf(alternate) === "ConditionalExpression") {
					const nextTest = cast<{ readonly test: object }>(alternate).test;
					const alternateCompared = comparedValue(context.sourceCode, nextTest);
					if (alternateCompared !== compared) return;
					literalChecks += 1;
					alternate = cast<{ readonly alternate: object }>(alternate).alternate;
				}
				if (literalChecks > 1) {
					context.report({ node, messageId: "preferMatch" });
				}
			},
		};
	},
});
