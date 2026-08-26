import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { isString } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

/**
 * Whether a component family (a Provider export plus a useXxx hook export)
 * must carry a dot-notation aggregate export.
 *
 * @param {{ hasProvider: boolean; hasHook: boolean; aggregateOk: boolean }} input - The family's export facts.
 * @returns {boolean} True when an aggregate is required but absent/incomplete.
 */
export function familyRequiresAggregate(input: {
	hasProvider: boolean;
	hasHook: boolean;
	aggregateOk: boolean;
}): boolean {
	return input.hasProvider && input.hasHook && !input.aggregateOk;
}

/**
 * Property key names of an object literal.
 *
 * @param {ESTree.Node} node - The object expression node.
 * @returns {Set<string>} The property key names.
 */
function objectPropKeys(node: ESTree.Node): Set<string> {
	const keys = new Set<string>();
	if (node.type !== "ObjectExpression") return keys;
	for (const prop of node.properties) {
		if (prop.type === "Property") {
			const key = prop.key;
			if (key.type === "Identifier") keys.add(key.name);
			else if (key.type === "Literal" && isString(key.value)) keys.add(key.value);
		}
	}
	return keys;
}

/**
 * Family name contributed by a useXxx export binding.
 *
 * @param {string} name - The exported binding name.
 * @returns {string | null} The family name, or null when not a useXxx hook.
 */
function hookFamily(name: string): string | null {
	const match = /^use([A-Z]\w*)$/u.exec(name);
	return match === null ? null : (match[1] ?? null);
}

/**
 * A component family (a Provider plus a `useXxx` consumer hook) must be exported
 * through a single dot-notation aggregate (`export const Family = { Provider, ... }`)
 * so consumers compose `Family.Provider` / `Family.Header` and the blocks are
 * discoverable. Bare re-exports of `Provider`/`useXxx` without the aggregate
 * hide the family boundary.
 */
export const requireDotNotationExportsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require a component family (Provider + useXxx hook) to be exported via a single dot-notation aggregate (export const Family = { Provider, ... }).",
		},
		messages: {
			missingAggregate:
				"Component family `{{family}}` exports a Provider and a `use{{family}}` hook but no dot-notation aggregate `export const {{family}} = { Provider, ... }`. Export the family as one object so consumers compose `{{family}}.Provider` / `{{family}}.Header` and the blocks are discoverable.",
		},
	},
	createOnce(context) {
		const providerExports = new Set<string>();
		const hookFamilies = new Set<string>();
		const aggregates = new Map<string, Set<string>>();
		let reportNode: ESTree.Node | null = null;

		const recordName = (entry: { name: string; node: ESTree.Node }): void => {
			if (reportNode === null) reportNode = entry.node;
			if (entry.name === "Provider" || entry.name.endsWith("Provider")) providerExports.add(entry.name);
			const hf = hookFamily(entry.name);
			if (hf !== null) hookFamilies.add(hf);
		};

		/**
		 * Whether an aggregate's keys include the Provider and the useXxx hook.
		 *
		 * @param {Set<string>} keys - The aggregate object's property keys.
		 * @returns {boolean} True when both the Provider and the hook are present.
		 */
		function hasProviderKey(keys: Set<string>): boolean {
			for (const k of keys) if (k === "Provider" || /Provider$/u.test(k)) return true;
			return false;
		}

		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			ExportNamedDeclaration(node) {
				const decl = node.declaration;
				if (decl !== null && decl !== undefined) {
					if (decl.type === "VariableDeclaration") {
						for (const declarator of decl.declarations) {
							if (declarator.id.type !== "Identifier") continue;
							recordName({ name: declarator.id.name, node });
							if (declarator.init?.type === "ObjectExpression") {
								aggregates.set(declarator.id.name, objectPropKeys(declarator.init));
							}
						}
					} else if (decl.type === "FunctionDeclaration" && decl.id !== null) {
						recordName({ name: decl.id.name, node });
					}
				}
				for (const specifier of node.specifiers) {
					if (specifier.type !== "ExportSpecifier") continue;
					const exported = specifier.exported;
					const name = exported.type === "Identifier" ? exported.name : (exported.value ?? "");
					recordName({ name, node });
				}
			},
			"Program:exit"() {
				if (providerExports.size === 0 || hookFamilies.size === 0) return;
				const node = reportNode;
				if (node === null) return;
				for (const family of hookFamilies) {
					const agg = aggregates.get(family);
					const ok = agg !== undefined && hasProviderKey(agg) && agg.has("use" + family);
					if (ok) continue;
					context.report({ node, messageId: "missingAggregate", data: { family } });
				}
			},
		};
	},
});
