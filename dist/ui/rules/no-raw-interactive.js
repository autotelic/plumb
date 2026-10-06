import { defineRule } from "@oxlint/plugins";
import { EMPTY_MANIFEST, createManifestCache } from "../manifest.js";
import { bannedTags, intrinsicNameOf } from "../elements.js";
import { scopeOf } from "../scope.js";
import { firstOptionRecord, stringListOption, stringMapOption } from "../../shared/rule-options.js";
/** Interactive elements whose behaviour and styling belong to primitives. */
const DEFAULT_INTERACTIVE_TAGS = ["a", "button", "input", "select", "textarea"];
/** Option key listing the banned tags. */
const TAGS_OPTION = "tags";
/** Option key mapping tags to the primitive that replaces them. */
const REPLACEMENTS_OPTION = "replacements";
/** Option key listing tags that stay raw. */
const ALLOW_NAMES_OPTION = "allowNames";
/** Option key listing path prefixes exempt from the rule; primitives live here. */
const ALLOW_PATHS_OPTION = "allowPaths";
/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED = { path: "", isJsx: false, colors: [], manifest: EMPTY_MANIFEST };
/**
 * The primitive a raw interactive element should be, or no finding at all.
 *
 * @param {{ readonly node: ESTree.JSXOpeningElement; readonly policy: InteractivePolicy }} query - The element and the configured policy.
 * @returns {InteractiveVerdict} Whether to report, and the primitive that replaces the tag.
 */
export function interactiveVerdict(query) {
    const tag = intrinsicNameOf(query.node);
    if (tag === null || !query.policy.tags.has(tag))
        return { primitive: "", report: false };
    if (query.policy.allowNames.includes(tag))
        return { primitive: "", report: false };
    const configured = query.policy.replacements[tag];
    if (configured !== undefined) {
        return { primitive: configured, report: true };
    }
    return { primitive: "the design system's matching primitive", report: true };
}
/**
 * The advice sentence for a raw interactive element.
 *
 * @param {string} primitive - The configured primitive, or the generic fallback.
 * @returns {string} The sentence appended to the finding.
 */
function adviceFor(primitive) {
    return ` Use \`<${primitive}>\`; the primitive decides focus, disabled, and keyboard behaviour once.`;
}
/**
 * Raw interactive elements carry behaviour no design system has approved.
 *
 * A `<button className="...">` picks its own focus ring, disabled treatment, and
 * keyboard semantics; the primitive is where those are decided once. Escape
 * hatches are configuration — `allowPaths` names the primitive modules
 * themselves — so the exemption list stays a reviewable fact about the system
 * rather than a pile of inline disables.
 */
export const noRawInteractiveRule = defineRule({
    meta: {
        type: "problem",
        docs: {
            description: "Disallow raw interactive elements outside primitive modules; use the design system's button, input, and link primitives.",
        },
        messages: {
            rawInteractiveTag: "`<{{tag}}>` is a raw interactive element.{{advice}}",
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
        let policy = {
            tags: new Set(DEFAULT_INTERACTIVE_TAGS),
            replacements: {},
            allowNames: [],
        };
        return {
            before() {
                const options = firstOptionRecord(context.options);
                scope = scopeOf({ cwd: context.cwd, filename: context.filename, options, cache });
                policy = {
                    tags: bannedTags({
                        tags: stringListOption(options, TAGS_OPTION),
                        fallback: DEFAULT_INTERACTIVE_TAGS,
                    }),
                    replacements: stringMapOption(options, REPLACEMENTS_OPTION),
                    allowNames: stringListOption(options, ALLOW_NAMES_OPTION),
                };
                if (!scope.isJsx)
                    return false;
                const allowPaths = stringListOption(options, ALLOW_PATHS_OPTION);
                if (allowPaths.some((pattern) => scope.path.startsWith(pattern)))
                    return false;
            },
            JSXOpeningElement(node) {
                const verdict = interactiveVerdict({ node, policy });
                if (!verdict.report)
                    return;
                context.report({
                    node,
                    messageId: "rawInteractiveTag",
                    data: { tag: intrinsicNameOf(node) ?? "", advice: adviceFor(verdict.primitive) },
                });
            },
        };
    },
});
