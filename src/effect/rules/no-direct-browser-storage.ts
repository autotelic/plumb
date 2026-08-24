import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { ancestorsOf } from "../../shared/ancestors.ts";

import { cast, isString, type NodeFieldValue } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

const BANNED_STORAGE = new Set(["indexedDB", "localStorage", "sessionStorage"]);

/** Discriminant reader for engine nodes the typings leave loose.
 *
 * @param {ESTree.Node} node - The engine node to read.
 * @returns {string} The node's `type` discriminant.
 */
function typeOf(node: ESTree.Node): string {
	return cast<{ readonly type: string }>(node).type;
}

/**
 * The banned-storage global named by an identifier, if any.
 *
 * @param {ESTree.Node} node - The identifier node to test.
 * @returns {string | null} The banned storage name, or null.
 */
function storageName(node: ESTree.Node): string | null {
	if (typeOf(node) !== "Identifier") return null;
	const name = cast<{ readonly name: string }>(node).name;
	return BANNED_STORAGE.has(name) ? name : null;
}

/** Browser storage globals hide I/O from the Effect runtime; persist through KeyValueStore or an injected store. */
export const noDirectBrowserStorageRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow direct browser storage globals (indexedDB, localStorage, sessionStorage); persist through Effect's KeyValueStore/IndexedDb modules or an injected storage service.",
		},
		messages: {
			directStorage:
				"`{{name}}` is reached directly, hiding I/O from the Effect runtime. Persist through Effect's KeyValueStore/IndexedDb layer or an injected storage service so access stays testable and swappable.",
		},
	},
	createOnce(context) {
		const reportStorage = (node: ESTree.Node, name: string): void => {
			context.report({ node, messageId: "directStorage", data: { name } });
		};
		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			Identifier(node) {
				const name = storageName(node);
				if (name === null) return;
				const chain = ancestorsOf(context.sourceCode, node);
				const parent = chain[0];
				const grandparent = chain[1];
				if (parent === undefined) return;
				const parentType = typeOf(parent);
				if (parentType === "MemberExpression") {
					return;
				}
				if (parentType === "ObjectProperty") {
					const propertyView = cast<{ readonly key: ESTree.Node; readonly value: ESTree.Node }>(parent);
					const containerType = grandparent === undefined ? "" : typeOf(grandparent);
					if (
						propertyView.key === node &&
						propertyView.value !== node &&
						containerType !== "ObjectPattern"
					) {
						return;
					}
				}
				if (parentType === "ImportSpecifier") {
					const specifierView = cast<{
						readonly imported?: ESTree.Node;
						readonly local?: ESTree.Node;
					}>(parent);
					if (specifierView.imported === node && specifierView.local !== node) {
						return;
					}
				}
				reportStorage(node, name);
			},
			MemberExpression(node) {
				const memberView = cast<{
					readonly object: ESTree.Node;
					readonly property: ESTree.Node;
					readonly computed?: boolean;
				}>(node);
				const direct = storageName(memberView.object);
				if (direct !== null) {
					reportStorage(node, direct);
					return;
				}
				const objectName =
					typeOf(memberView.object) === "Identifier"
						? cast<{ readonly name: string }>(memberView.object).name
						: undefined;
				if (objectName !== "globalThis" && objectName !== "window") return;
				let propertyName: NodeFieldValue | undefined;
				if (memberView.computed === true) {
					propertyName =
						typeOf(memberView.property) === "Literal"
							? cast<{ readonly value?: NodeFieldValue }>(memberView.property).value
							: undefined;
				} else {
					propertyName =
						typeOf(memberView.property) === "Identifier"
							? cast<{ readonly name: string }>(memberView.property).name
							: undefined;
				}
				if (
					propertyName !== undefined &&
					isString(propertyName) &&
					BANNED_STORAGE.has(propertyName)
				) {
					reportStorage(node, propertyName);
				}
			},
		};
	},
});
