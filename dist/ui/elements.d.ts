import type { ESTree } from "@oxlint/plugins";
/**
 * The intrinsic tag a JSX element renders, or null when it is a component.
 *
 * @param {ESTree.JSXOpeningElement} node - The opening element.
 * @returns {string | null} The tag name, or null for components and member expressions.
 */
export declare function intrinsicNameOf(node: ESTree.JSXOpeningElement): string | null;
/**
 * The tag names a configuration bans, defaulting to the documented set.
 *
 * @param {{ readonly tags: readonly string[]; readonly fallback: readonly string[] }} query - Configured tags and defaults.
 * @returns {ReadonlySet<string>} The banned tag names.
 */
export declare function bannedTags(query: {
    readonly tags: readonly string[];
    readonly fallback: readonly string[];
}): ReadonlySet<string>;
