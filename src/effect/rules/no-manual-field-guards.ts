import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";
import { ancestorsOf } from "../../shared/ancestors.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

function calleeName(node: ESTree.CallExpression): string | null {
	const callee = node.callee;
	if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
		return callee.property.name;
	}
	return null;
}

function isRegExpTestCall(node: ESTree.CallExpression): boolean {
	const callee = node.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.property.type === "Identifier" &&
		callee.property.name === "test"
	);
}

function isOptionGuardBinary(expression: ESTree.Expression): boolean {
	if (expression.type !== "BinaryExpression") return false;
	if (expression.operator !== "===" && expression.operator !== "!==") return false;
	const sides = [expression.left, expression.right];
	const tagMember = sides.find(
		(side) => side.type === "MemberExpression" && side.property.type === "Identifier" && side.property.name === "_tag",
	);
	const literal = sides.find((side) => side.type === "Literal");
	return (
		tagMember !== undefined &&
		literal !== undefined &&
		literal.type === "Literal" &&
		(literal.value === "None" || literal.value === "Some")
	);
}

function isOptionIsCall(node: ESTree.CallExpression): boolean {
	const name = calleeName(node);
	return name === "isNone" || name === "isSome";
}

/** Whether this node sits inside a `Schema.makeFilter` predicate, where ad-hoc checks are the point. */
function insideMakeFilter(node: ESTree.Node, ancestors: ReadonlyArray<ESTree.Node>): boolean {
	for (let index = ancestors.length - 1; index >= 0; index--) {
		const current = ancestors[index]!;
		if (current.type === "Program") break;
		if (current.type === "CallExpression" && calleeName(current) === "makeFilter") {
			return true;
		}
	}
	return false;
}

/**
 * Once a module decodes payloads through SchemaParser, per-field validation
 * belongs in Schema refinements (checks/filters) so evidence flows through the
 * schema issue channel instead of hand-rolled ladders beside the decoder.
 */
export const noManualFieldGuardsRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"In modules that decode via SchemaParser, require field validation to live in Schema refinements rather than hand-rolled regex tests and Option-tag guards.",
		},
		messages: {
			regexTest:
				"Hand-rolled lexical check beside a SchemaParser decode. Move this predicate into a Schema refinement (`.check(Schema.makeFilter(...))`) so failures surface as schema issue evidence.",
			optionGuard:
				"Hand-rolled Option-tag guard beside a SchemaParser decode. Validate the field with a Schema refinement (or decode into the domain value via `SchemaGetter.transformOrFail`) so the ladder branch disappears.",
		},
	},
	createOnce(context) {
		let hasDecode = false;
		const pending: Array<{ node: ESTree.Node; messageId: "regexTest" | "optionGuard" }> = [];
		const optionVars = new Set<string>();
		const queue = (node: ESTree.Node, messageId: "regexTest" | "optionGuard"): void => {
			if (insideMakeFilter(node, ancestorsOf(context.sourceCode, node))) return;
			pending.push({ node, messageId });
		};
		return {
		before() {
			if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			hasDecode = false;
			pending.length = 0;
			optionVars.clear();
		},
			CallExpression(node) {
				const name = calleeName(node);
				if (name !== null && name.startsWith("decodeUnknown")) hasDecode = true;
				if (isRegExpTestCall(node)) {
					queue(node, "regexTest");
					return;
				}
				if (isOptionIsCall(node)) {
					const argument = node.arguments[0];
					if (
						argument !== undefined &&
						argument.type === "Identifier" &&
						optionVars.has(argument.name)
					) {
						queue(node, "optionGuard");
					}
				}
			},
			IfStatement(node) {
				if (!isOptionGuardBinary(node.test)) return;
				const binaryTest = node.test as ESTree.BinaryExpression;
				const sides = [binaryTest.left, binaryTest.right];
				const tagMember = sides.find(
					(side) => side.type === "MemberExpression" && side.object.type === "Identifier",
				) as ESTree.MemberExpression | undefined;
				if (
					tagMember !== undefined &&
					tagMember.object.type === "Identifier" &&
					optionVars.has(tagMember.object.name)
				) {
					queue(node.test, "optionGuard");
				}
			},
			"Program:exit"() {
				// A module either decodes payloads through SchemaParser or it does not:
				// decide after the whole file is seen so visit order cannot hide guards.
				if (!hasDecode) return;
				for (const { node, messageId } of pending) {
					context.report({ node, messageId });
				}
			},
			VariableDeclarator(node) {
				if (node.init !== null && node.init !== undefined && node.init.type === "CallExpression") {
					const name = calleeName(node.init);
					// Only parser-style cores (from*Option) carry payload fields worth
					// refining into Schema; result-Option plumbing (addOption etc.) is
					// blessed internal composition, not field validation.
					if (
						name !== null &&
						name.startsWith("from") &&
						name.endsWith("Option") &&
						node.id.type === "Identifier"
					) {
						optionVars.add(node.id.name);
					}
				}
			},
		};
	},
});
