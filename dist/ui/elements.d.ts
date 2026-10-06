import type { ESTree } from "@oxlint/plugins";
import type { OptionRecord } from "../shared/rule-options.ts";
/** The banned tags, their replacements, and the names that stay raw. */
export interface TagPolicy {
    readonly tags: ReadonlySet<string>;
    readonly replacements: Readonly<Record<string, string>>;
    readonly allowNames: readonly string[];
}
/** Rule options plus the tags a project falls back to when it names none. */
export interface TagPolicyQuery {
    readonly options: OptionRecord;
    readonly fallback: readonly string[];
}
/**
 * The intrinsic tag a JSX element renders, or null when it is a component.
 *
 * @param {ESTree.JSXOpeningElement} node - The opening element.
 * @returns {string | null} The tag name, or null for components and member expressions.
 */
export declare function intrinsicNameOf(node: ESTree.JSXOpeningElement): string | null;
/**
 * Resolve the tag policy a project's configuration declares.
 *
 * @param {TagPolicyQuery} query - The rule options and the default tag set.
 * @returns {TagPolicy} The resolved policy.
 */
export declare function resolveTagPolicy(query: TagPolicyQuery): TagPolicy;
/**
 * Whether a configured allowlist of path prefixes exempts a file.
 *
 * @param {{ readonly options: OptionRecord; readonly path: string }} query - The rule options and the file path.
 * @returns {boolean} True when a configured prefix claims the file.
 */
export declare function isPathExempt(query: {
    readonly options: OptionRecord;
    readonly path: string;
}): boolean;
