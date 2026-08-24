import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { cast, isString, type NodeFieldValue } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

const PROVISION_METHODS = new Set(["provide", "provideMerge"]);

/** Discriminant reader for engine nodes the typings leave loose.
 *
 * @param {ESTree.Node} node - The engine node to read.
 * @returns {string} The node's `type` discriminant.
 */
function typeOf(node: ESTree.Node): string {
	return cast<{ readonly type: string }>(node).type;
}

/**
 * Property name of a member expression, computed or plain.
 *
 * @param {ESTree.Node} member - The member expression node.
 * @returns {string | null} The property name, or null when unavailable.
 */
function memberName(member: ESTree.Node): string | null {
	const memberView = cast<{
		readonly computed?: boolean;
		readonly property: ESTree.Node;
	}>(member);
	if (memberView.computed === true) {
		const value = cast<{ readonly value?: NodeFieldValue }>(memberView.property).value;
		return value !== undefined && isString(value) ? value : null;
	}
	return typeOf(memberView.property) === "Identifier"
		? cast<{ readonly name: string }>(memberView.property).name
		: null;
}

/** Whether an argument is a `<layerVariable>.provide(...)` / provideMerge call.
 *
 * @param {ESTree.Node} argument - The pipe argument to inspect.
 * @param {ReadonlySet<string>} layerNames - Local names bound to the Layer export.
 * @returns {boolean} True when the argument provisions a layer.
 */
function isLayerProvision(argument: ESTree.Node, layerNames: ReadonlySet<string>): boolean {
	if (typeOf(argument) !== "CallExpression") return false;
	const callee = cast<{ readonly callee: ESTree.Node }>(argument).callee;
	if (typeOf(callee) !== "MemberExpression") return false;
	const object = cast<{ readonly object: ESTree.Node }>(callee).object;
	if (typeOf(object) !== "Identifier") return false;
	if (!layerNames.has(cast<{ readonly name: string }>(object).name)) return false;
	return memberName(callee) !== null && PROVISION_METHODS.has(memberName(callee) ?? "");
}

/** Multiple provision stages in one pipe entangle dependency tiers; combine independent layers or name each stage.
 *
 * Import tracking covers local names bound to the `Layer` export of
 * "effect"; re-exports are not tracked.
 */
export const noCascadingLayerProvideRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow multiple Layer.provide/provideMerge stages in one pipe; combine independent dependencies in one Layer.provide([...]) and extract intentional dependency stages as named layers.",
		},
		messages: {
			cascadingProvide:
				"Multiple `Layer.provide` stages run in this pipe, entangling dependency tiers. Combine independent dependencies into one `Layer.provide([a, b])`; when a layer depends on another layer, extract that configured layer into a named value before providing it.",
		},
	},
	createOnce(context) {
		const layerNames = new Set<string>();
		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			ImportDeclaration(node) {
				const source = cast<{
					readonly source?: { readonly value?: unknown };
					readonly specifiers: ReadonlyArray<ESTree.Node>;
				}>(node);
				if (source.source?.value !== "effect") return;
				for (const specifier of source.specifiers) {
					const imported = cast<{
						readonly imported?: { readonly name?: string; readonly value?: NodeFieldValue };
					}>(specifier).imported;
					if (imported === undefined) continue;
					const importedName =
						imported.name ?? (imported.value !== undefined && isString(imported.value) ? imported.value : undefined);
					const local = cast<{ readonly local?: { readonly name?: string } }>(specifier).local?.name;
					if (importedName === "Layer" && local !== undefined) layerNames.add(local);
				}
			},
			CallExpression(node) {
				const callee = node.callee;
				if (
					callee.type !== "MemberExpression" ||
					callee.computed === true ||
					callee.property.type !== "Identifier" ||
					callee.property.name !== "pipe"
				) {
					return;
				}
				let stages = 0;
				for (const argument of node.arguments) {
					if (isLayerProvision(argument, layerNames)) stages += 1;
				}
				if (stages < 2) return;
				context.report({ node, messageId: "cascadingProvide" });
			},
		};
	},
});
