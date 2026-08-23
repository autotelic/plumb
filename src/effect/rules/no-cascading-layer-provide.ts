import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { cast } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

const PROVISION_METHODS = new Set(["provide", "provideMerge"]);

/** Discriminant reader for engine nodes the typings leave loose. */
function typeOf(node: object): string {
	return cast<{ readonly type: string }>(node).type;
}

function memberName(member: object): string | null {
	const shape = cast<{
		readonly computed?: boolean;
		readonly property: object;
	}>(member);
	if (shape.computed === true) {
		const value = cast<{ readonly value?: unknown }>(shape.property).value;
		return typeof value === "string" ? value : null;
	}
	return typeOf(shape.property) === "Identifier"
		? cast<{ readonly name: string }>(shape.property).name
		: null;
}

function isLayerProvision(argument: object, layerNames: ReadonlySet<string>): boolean {
	if (typeOf(argument) !== "CallExpression") return false;
	const callee = cast<{ readonly callee: object }>(argument).callee;
	if (typeOf(callee) !== "MemberExpression") return false;
	const object = cast<{ readonly object: object }>(callee).object;
	if (typeOf(object) !== "Identifier") return false;
	if (!layerNames.has(cast<{ readonly name: string }>(object).name)) return false;
	return memberName(callee) !== null && PROVISION_METHODS.has(memberName(callee) ?? "");
}
/** Multiple provision stages in one pipe entangle dependency tiers; combine independent layers or name each stage. */
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
		// Local names bound to the `Layer` export of "effect"; re-exports are not tracked.
		const layerNames = new Set<string>();
		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			ImportDeclaration(node) {
				const source = cast<{
					readonly source?: { readonly value?: unknown };
					readonly specifiers: ReadonlyArray<object>;
				}>(node);
				if (source.source?.value !== "effect") return;
				for (const specifier of source.specifiers) {
					const imported = cast<{
						readonly imported?: { readonly type: string; readonly name?: string; readonly value?: unknown };
					}>(specifier).imported;
					if (imported === undefined) continue;
					const importedName = imported.name ?? (typeof imported.value === "string" ? imported.value : undefined);
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
					if (isLayerProvision(argument as object, layerNames)) stages += 1;
				}
				if (stages < 2) return;
				context.report({ node, messageId: "cascadingProvide" });
			},
		};
	},
});
