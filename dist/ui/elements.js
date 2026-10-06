/*
 * JSX element naming for the tag-level UI rules.
 *
 * A rule that bans raw layout tags must not fire on components: `<PageCard />`
 * is the design system's own vocabulary, `<div />` is the escape hatch. The
 * distinction is lexical — an intrinsic tag is a single lowercase identifier,
 * everything else is the project's own composition.
 */
/**
 * The intrinsic tag a JSX element renders, or null when it is a component.
 *
 * @param {ESTree.JSXOpeningElement} node - The opening element.
 * @returns {string | null} The tag name, or null for components and member expressions.
 */
export function intrinsicNameOf(node) {
    if (node.name.type !== "JSXIdentifier")
        return null;
    return /^[a-z]/u.test(node.name.name) ? node.name.name : null;
}
/**
 * The tag names a configuration bans, defaulting to the documented set.
 *
 * @param {{ readonly tags: readonly string[]; readonly fallback: readonly string[] }} query - Configured tags and defaults.
 * @returns {ReadonlySet<string>} The banned tag names.
 */
export function bannedTags(query) {
    return new Set(query.tags.length === 0 ? query.fallback : query.tags);
}
