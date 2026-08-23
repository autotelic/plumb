import type { ESTree, SourceCode } from "@oxlint/plugins";

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

/** Engine comment shape, normalized for rule consumption. */
export interface CommentLike {
	type: string;
	value: string;
	end?: number;
	range?: readonly [number, number];
	loc?: {
		start?: { line?: number };
		end?: { line?: number };
	};
}

/** All comments in the file, typed for rule consumption. */
export function getAllComments(sourceCode: SourceCode): CommentLike[] {
	return sourceCode.getAllComments() as CommentLike[];
}

/**
 * Strip parenthesized wrappers while preserving the caller's node type.
 *
 * SAFETY: parenthesized wrappers are transparent containers; the runtime value
 * is unchanged, only the static view is restored.
 */
export function unwrapParentheses<T extends ESTree.Expression>(expression: T): T {
	let current: ESTree.Expression = expression;
	while (current.type === "ParenthesizedExpression") {
		current = current.expression;
	}
	return current as T;
}

/**
 * Reinterpret an opaquely-typed value as T.
 *
 * SAFETY: the single sanctioned escape hatch for AST shapes the engine types
 * loosely; callers document the verified invariant adjacent to each call.
 */
export function cast<T>(value: unknown): T {
	return value as T;
}

/** Discriminate object-valued fields of an AST node (child containers). */
export function isRecordObject(
	value: NodeFieldValue | Record<string, NodeFieldValue>,
): value is Record<string, NodeFieldValue> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
