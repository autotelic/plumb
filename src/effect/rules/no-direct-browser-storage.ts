import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { ancestorsOf } from "../../shared/ancestors.ts";

import { cast } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

const BANNED_STORAGE = new Set(["indexedDB", "localStorage", "sessionStorage"]);

/** Discriminant reader for engine nodes the typings leave loose. */
function typeOf(node: object): string {
	return cast<{ readonly type: string }>(node).type;
}

function storageName(node: object): string | null {
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
					// Object and plain-property positions are reported once, on the member itself.
					return;
				}
				if (parentType === "ObjectProperty") {
					const shape = cast<{ readonly key: object; readonly value: object }>(parent);
					const containerType = grandparent === undefined ? "" : typeOf(grandparent);
					if (
						shape.key === node &&
						shape.value !== node &&
						containerType !== "ObjectPattern"
					) {
						// Literal key position, not a destructured read.
						return;
					}
				}
				if (parentType === "ImportSpecifier") {
					const shape = cast<{
						readonly imported?: object;
						readonly local?: object;
					}>(parent);
					if (shape.imported === node && shape.local !== node) {
						// Aliased import binds under a different local name.
						return;
					}
				}
				reportStorage(node, name);
			},
			MemberExpression(node) {
				const shape = cast<{
					readonly object: object;
					readonly property: object;
					readonly computed?: boolean;
				}>(node);
				const direct = storageName(shape.object);
				if (direct !== null) {
					reportStorage(node, direct);
					return;
				}
				const objectName =
					typeOf(shape.object) === "Identifier"
						? cast<{ readonly name: string }>(shape.object).name
						: undefined;
				if (objectName !== "globalThis" && objectName !== "window") return;
				const propertyName =
					shape.computed === true
						? typeOf(shape.property) === "Literal"
							? cast<{ readonly value?: unknown }>(shape.property).value
							: undefined
						: typeOf(shape.property) === "Identifier"
							? cast<{ readonly name: string }>(shape.property).name
							: undefined;
				if (typeof propertyName === "string" && BANNED_STORAGE.has(propertyName)) {
					reportStorage(node, propertyName);
				}
			},
		};
	},
});
