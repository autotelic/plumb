import type { ESTree } from "@oxlint/plugins";

/**
 * The closed domain of values reachable from ESTree node fields.
 *
 * Nothing crossing rule logic is `unknown`: reflection over node fields
 * yields exactly this union, so guards accept it instead of re-widening
 * caller evidence to unknown.
 */
export type NodeFieldValue =
	| ESTree.Node
	| readonly ESTree.Node[]
	| string
	| number
	| bigint
	| boolean
	| RegExp
	| null
	| undefined;

/**
 * Read a field from an ESTree node without chained assertions.
 *
 * SAFETY: callers invoke this after a discriminant (or containment) check that
 * establishes the key exists on the node's runtime shape; the value's domain is
 * owned by the AST grammar (see NodeFieldValue), not by untrusted input.
 */
export function readField<T = NodeFieldValue>(
	node: object | null | undefined,
	key: string,
): T | undefined {
	if (node === null || node === undefined) return undefined;
	return (node as Record<string, T>)[key];
}

/** Discriminate string-valued fields or expressions of an AST node. */
export function isString(value: NodeFieldValue | ESTree.Expression): value is string {
	return typeof value === "string";
}

/** Discriminate object-valued fields of an AST node (child containers). */
export function isRecordObject(
	value: NodeFieldValue | Record<string, NodeFieldValue>,
): value is Record<string, NodeFieldValue> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
