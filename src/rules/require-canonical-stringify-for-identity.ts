import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";
import { ancestorsOf } from "../shared/ancestors.ts";

const COMPARISON_OPERATORS = new Set(["===", "!==", "==", "!="]);
const MAP_KEY_METHODS = new Set(["get", "has", "delete"]);
const SET_KEY_METHODS = new Set(["add", "has", "delete"]);

function isJsonStringify(node: ESTree.Node): boolean {
	if (node.type !== "CallExpression") return false;
	const callee = node.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "JSON" &&
		callee.property.type === "Identifier" &&
		callee.property.name === "stringify"
	);
}

/**
 * Canonical form: JSON.stringify walks insertion order, so structurally
 * equal data can serialise to different strings depending on construction
 * history. As an identity function — comparison, Map/Set key, hash input —
 * that is a false-negative machine. Only a canonical (key-sorted)
 * serializer may stand in for structural equality there.
 */
export const requireCanonicalStringifyForIdentityRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow JSON.stringify as an identity function (equality comparison, Map/Set key, hash input); use a canonical key-sorted serializer instead.",
		},
		messages: {
			nonCanonicalIdentity:
				"`JSON.stringify` here follows property insertion order, so equal data can produce different strings and identical-looking data can hide inequality. Use a canonical serializer (recursively key-sorted) before using the result for {{use}}.",
		},
	},
	createOnce(context) {
		function report(node: ESTree.CallExpression, use: string): void {
			context.report({ node, messageId: "nonCanonicalIdentity", data: { use } });
		}

		return {
			CallExpression(node) {
				if (!isJsonStringify(node)) return;
				// getAncestors returns an internal Node type; recover the ESTree union for narrowing.
				const parent = (ancestorsOf(context.sourceCode, node)).at(-1);
				if (parent === null || parent === undefined) return;

				if (parent.type === "BinaryExpression" && COMPARISON_OPERATORS.has(parent.operator)) {
					report(node, "equality comparison");
					return;
				}
				if (parent.type === "MemberExpression" && parent.computed) {
					report(node, "property lookup");
					return;
				}
				if (parent.type === "CallExpression" && parent.callee.type === "MemberExpression" && !parent.callee.computed) {
					const method = parent.callee.property;
					if (method.type !== "Identifier") return;
					// `has`/`delete` are ambiguous between Map/Set; default to the map wording
					if (MAP_KEY_METHODS.has(method.name) && parent.arguments[0] === node) {
						report(node, `${method.name}() on a map`);
						return;
					}
					if (SET_KEY_METHODS.has(method.name) && parent.arguments[0] === node) {
						report(node, `${method.name}() on a set`);
						return;
					}
					if (method.name === "set" && parent.arguments[0] === node) {
						report(node, "a map key");
					}
				}
			},
		};
	},
});
