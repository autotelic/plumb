import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const PREDICATE_NAME = /^is[A-Z]/u;

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

function isDomainPredicateCall(expression: ESTree.Expression): boolean {
	if (expression.type !== "CallExpression") return false;
	const callee = expression.callee;
	if (
		callee.type === "MemberExpression" &&
		callee.object.type === "Identifier" &&
		callee.object.name === "Option"
	) {
		return false;
	}
	if (callee.type === "Identifier") return PREDICATE_NAME.test(callee.name);
	return (
		callee.type === "MemberExpression" &&
		callee.property.type === "Identifier" &&
		PREDICATE_NAME.test(callee.property.name)
	);
}

/** True for a logical chain (>= 2 operands) whose every leaf is a domain-predicate call. */
function isPredicateChain(expression: ESTree.Expression): boolean {
	if (expression.type !== "LogicalExpression") return false;
	return chainLeaf(expression.left) && chainLeaf(expression.right);
}

function chainLeaf(expression: ESTree.Expression): boolean {
	if (expression.type === "LogicalExpression") {
		return chainLeaf(expression.left) && chainLeaf(expression.right);
	}
	if ((expression as { type?: string }).type === "ParenthesizedExpression") {
		return chainLeaf((expression as unknown as { expression: ESTree.Expression }).expression);
	}
	return isDomainPredicateCall(expression);
}

function childNodes(node: ESTree.Node): Array<ESTree.Node> {
	const children: Array<ESTree.Node> = [];
	for (const key of Object.keys(node)) {
		if (key === "parent" || key === "loc" || key === "range") continue;
		const value = (node as unknown as Record<string, unknown>)[key];
		const candidates = Array.isArray(value) ? value : [value];
		for (const candidate of candidates) {
			if (
				candidate !== null &&
				typeof candidate === "object" &&
				typeof (candidate as ESTree.Node).type === "string"
			) {
				children.push(candidate as ESTree.Node);
			}
		}
	}
	return children;
}

/** True when the subtree produces an Option.none()/Option.some(...) result. */
function containsOptionResult(node: ESTree.Node | null | undefined): boolean {
	if (node === null || node === undefined) return false;
	if (
		node.type === "CallExpression" &&
		node.callee.type === "MemberExpression" &&
		node.callee.object.type === "Identifier" &&
		node.callee.object.name === "Option" &&
		node.callee.property.type === "Identifier" &&
		(node.callee.property.name === "none" || node.callee.property.name === "some")
	) {
		return true;
	}
	return childNodes(node).some(containsOptionResult);
}

/** Inline chains of domain predicates guarding Options should be named Predicates. */
export const preferNamedGuardPredicateRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require guards built from chained domain predicates to be extracted into a named P.Predicate and lifted through Option.liftPredicate so the guard composes and carries a name.",
		},
		messages: {
			namedGuardPredicate:
				"This guard anonymously chains domain predicates. Extract a named `P.Predicate` (composed via P.and/P.or/P.not) and lift the value with `Option.liftPredicate` so the guard is reusable, testable and self-describing.",
		},
	},
	createOnce(context) {
		const checkGuard = (
			test: ESTree.Expression,
			branches: Array<ESTree.Node | null | undefined>,
		): void => {
			if (!isPredicateChain(test)) return;
			if (!branches.some((branch) => containsOptionResult(branch))) return;
			context.report({ node: test, messageId: "namedGuardPredicate" });
		};
		return {
		before() {
			if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
		},
			ConditionalExpression(node) {
				checkGuard(node.test, [node.consequent, node.alternate]);
			},
			IfStatement(node) {
				checkGuard(node.test, [node.consequent, node.alternate]);
			},
		};
	},
});
