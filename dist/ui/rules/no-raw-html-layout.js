import { defineRule } from "@oxlint/plugins";
import { EMPTY_MANIFEST, createManifestCache } from "../manifest.js";
import { intrinsicNameOf, isPathExempt, resolveTagPolicy } from "../elements.js";
import { scopeOf } from "../scope.js";
import { firstOptionRecord } from "../../shared/rule-options.js";
/** Layout and text tags replaced by the container primitives. */
const DEFAULT_LAYOUT_TAGS = [
    "article",
    "aside",
    "dd",
    "div",
    "dl",
    "dt",
    "figcaption",
    "footer",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "section",
    "span",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
];
/** Tags whose replacement is a text primitive rather than a container. */
const TEXT_TAGS = new Set(["dd", "dt", "h1", "h2", "h3", "h4", "h5", "h6", "li", "p", "span"]);
/** The primitive suggested when configuration names no replacement. */
const DEFAULT_CONTAINER = "Box";
/** The primitive suggested for text tags when configuration names no replacement. */
const DEFAULT_TEXT = "Text";
/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED = { path: "", isJsx: false, colors: [], manifest: EMPTY_MANIFEST };
/**
 * The primitive a raw layout tag should be, or no finding at all.
 *
 * @param {{ readonly node: ESTree.JSXOpeningElement; readonly policy: LayoutPolicy }} query - The element and the configured policy.
 * @returns {LayoutVerdict} Whether to report, and the primitive that replaces the tag.
 */
export function layoutVerdict(query) {
    const tag = intrinsicNameOf(query.node);
    if (tag === null || !query.policy.tags.has(tag))
        return { primitive: DEFAULT_CONTAINER, report: false };
    if (query.policy.allowNames.includes(tag))
        return { primitive: DEFAULT_CONTAINER, report: false };
    const configured = query.policy.replacements[tag];
    if (configured !== undefined)
        return { primitive: configured, report: true };
    return { primitive: TEXT_TAGS.has(tag) ? DEFAULT_TEXT : DEFAULT_CONTAINER, report: true };
}
/**
 * Raw layout tags are the design system's escape hatch.
 *
 * The primitives exist so spacing, colour, and semantics arrive through one
 * typed surface. A bare `<div className="p-4">` skips all of it and still
 * type-checks, which is exactly why it wins: it is the path of least resistance.
 * Projects enable this rule once the primitives they point at exist, and widen
 * its scope as the finding count falls.
 */
export const noRawHtmlLayoutRule = defineRule({
    meta: {
        type: "problem",
        docs: {
            description: "Disallow raw layout and text elements in application code; compose the Box/Stack/Text primitives instead.",
        },
        messages: {
            rawLayoutTag: "`<{{tag}}>` is a raw layout element. Use `<{{primitive}}>` so spacing, colour, and semantics come from the design system's token-typed surface.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    tags: { type: "array", items: { type: "string" } },
                    replacements: { type: "object", additionalProperties: { type: "string" } },
                    allowNames: { type: "array", items: { type: "string" } },
                    allowPaths: { type: "array", items: { type: "string" } },
                },
                additionalProperties: false,
            },
        ],
        defaultOptions: [{}],
    },
    createOnce(context) {
        const cache = createManifestCache();
        let scope = UNSCOPED;
        let policy = { tags: new Set(DEFAULT_LAYOUT_TAGS), replacements: {}, allowNames: [] };
        return {
            before() {
                const options = firstOptionRecord(context.options);
                scope = scopeOf({ cwd: context.cwd, filename: context.filename, options, cache });
                policy = resolveTagPolicy({ options, fallback: DEFAULT_LAYOUT_TAGS });
                if (!scope.isJsx)
                    return false;
                if (isPathExempt({ options, path: scope.path }))
                    return false;
            },
            JSXOpeningElement(node) {
                const verdict = layoutVerdict({ node, policy });
                if (!verdict.report)
                    return;
                context.report({
                    node,
                    messageId: "rawLayoutTag",
                    data: { tag: intrinsicNameOf(node) ?? "", primitive: verdict.primitive },
                });
            },
        };
    },
});
