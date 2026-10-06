import { stringListOption, stringMapOption } from "../shared/rule-options.js";
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
 * Resolve the tag policy a project's configuration declares.
 *
 * @param {TagPolicyQuery} query - The rule options and the default tag set.
 * @returns {TagPolicy} The resolved policy.
 */
export function resolveTagPolicy(query) {
    const tags = stringListOption(query.options, "tags");
    return {
        tags: new Set(tags.length === 0 ? query.fallback : tags),
        replacements: stringMapOption(query.options, "replacements"),
        allowNames: stringListOption(query.options, "allowNames"),
    };
}
/**
 * Whether a configured allowlist of path prefixes exempts a file.
 *
 * @param {{ readonly options: OptionRecord; readonly path: string }} query - The rule options and the file path.
 * @returns {boolean} True when a configured prefix claims the file.
 */
export function isPathExempt(query) {
    return stringListOption(query.options, "allowPaths").some((pattern) => query.path.startsWith(pattern));
}
