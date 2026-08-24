import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { cast } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

/** Discriminant reader for engine nodes the typings leave loose.
 *
 * @param {ESTree.Node} node - The engine node to read.
 * @returns {string} The node's `type` discriminant.
 */
function typeOf(node: ESTree.Node): string {
	return cast<{ readonly type: string }>(node).type;
}

/**
 * Whether a call targets `Layer.provide`.
 *
 * @param {ESTree.Node} node - The candidate call expression.
 * @returns {boolean} True when the call is a Layer.provide invocation.
 */
function isLayerProvide(node: ESTree.Node): boolean {
	if (typeOf(node) !== "CallExpression") return false;
	const callee = cast<{ readonly callee: ESTree.Node }>(node).callee;
	if (typeOf(callee) !== "MemberExpression") return false;
	const object = cast<{ readonly object: ESTree.Node }>(callee).object;
	if (typeOf(object) !== "Identifier") return false;
	const property = cast<{ readonly property: ESTree.Node; readonly computed?: boolean }>(callee);
	return (
		property.computed !== true &&
		cast<{ readonly name: string }>(object).name === "Layer" &&
		cast<{ readonly name: string }>(property.property).name === "provide"
	);
}
/** Nested Layer.provide calls hide the dependency stage; extract the inner layer or use provideMerge. */
export const noNestedLayerProvideRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Layer.provide nested inside Layer.provide; extract the inner layer to a named value or use Layer.provideMerge so each dependency stage is visible.",
		},
		messages: {
			nestedProvide:
				"`Layer.provide` inside `Layer.provide` hides this dependency stage. Extract the inner layer into a named value, or use `Layer.provideMerge` when the layers are independent.",
		},
	},
	createOnce(context) {
		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			CallExpression(node) {
				if (!isLayerProvide(node)) return;
				for (const argument of node.arguments) {
					if (isLayerProvide(argument)) {
						context.report({
							node: argument,
							messageId: "nestedProvide",
						});
					}
				}
			},
		};
	},
});
