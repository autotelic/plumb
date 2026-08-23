import type { ESTree } from "@oxlint/plugins";

/**
 * Read a property from an ESTree node variant without chained assertions.
 *
 * SAFETY: callers invoke this after a discriminant (or containment) check that
 * establishes the key exists on the node's runtime shape; the value's domain is
 * owned by the AST grammar, not by untrusted input.
 */
export function readField<T = unknown>(node: unknown, key: string): T | undefined {
	return (node as Record<string, unknown>)[key] as T | undefined;
}

/**
 * Sanctioned boundary guards for untyped AST payloads.
 *
 * SAFETY: these wrap the only `typeof` checks a rule should need — at the
 * point where loosely-typed AST JSON crosses into rule logic. Downstream
 * code branches on the narrowed domain type instead of representations.
 */
export function isString(value: unknown): value is string {
	return typeof value === "string";
}

export function isRecordObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Nearest-first ancestor chain accessor lives in ./ancestors.ts; kept separate for clarity.
 *  Re-exported here so rule code needs a single structural-import site. */
export type { ESTree };
