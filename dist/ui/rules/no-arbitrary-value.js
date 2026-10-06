import { defineRule } from "@oxlint/plugins";
import { arbitraryValueOf, classAttributesOf, classStringsIn, isArbitraryColor, utilitiesIn, utilityOf, } from "../tokens.js";
import { EMPTY_MANIFEST, createManifestCache } from "../manifest.js";
import { scopeOf } from "../scope.js";
import { firstOptionRecord, stringListOption } from "../../shared/rule-options.js";
/** Option key listing path prefixes exempt from the rule. */
const ALLOW_PATHS_OPTION = "allowPaths";
/** Option key listing utility prefixes that stay legal. */
const ALLOW_TOKENS_OPTION = "allowTokens";
/** Option key handing arbitrary color literals to `no-off-token-color`. */
const SKIP_COLORS_OPTION = "skipColorLiterals";
/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED = { path: "", isJsx: false, colors: [], manifest: EMPTY_MANIFEST };
/**
 * Every arbitrary value a set of class strings spells out.
 *
 * @param {ArbitraryScan} scan - The class strings and the exemptions to apply.
 * @returns {readonly ArbitraryFinding[]} One finding per arbitrary utility token.
 */
export function arbitraryFindings(scan) {
    const findings = [];
    for (const hit of utilitiesIn({ classes: scan.classes, allowTokens: scan.allowTokens })) {
        const utility = utilityOf(hit.token);
        if (scan.skipColorLiterals && isArbitraryColor(utility))
            continue;
        const value = arbitraryValueOf(utility);
        if (value === null)
            continue;
        findings.push({ node: hit.node, token: hit.token, value });
    }
    return findings;
}
/**
 * An arbitrary value is a design decision smuggled past review.
 *
 * `p-[17px]` reads like a spacing choice but is a one-off: it has no name, no
 * owner, and no place in the scale, so the next author copies it instead of
 * reaching for the token that should exist. The legitimate arbitrary values
 * (variant selectors, grid templates) are named in `allowTokens` rather than
 * left to per-line disables.
 */
export const noArbitraryValueRule = defineRule({
    meta: {
        type: "problem",
        docs: {
            description: "Disallow arbitrary values in class names; add a token or use a scale step instead of a one-off literal.",
        },
        messages: {
            arbitraryValue: "`{{token}}` hard-codes `{{value}}` outside the token scale. Add a token, use a scale step, or allowlist the utility prefix in configuration.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    allowPaths: { type: "array", items: { type: "string" } },
                    allowTokens: { type: "array", items: { type: "string" } },
                    skipColorLiterals: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
        defaultOptions: [{}],
    },
    createOnce(context) {
        const cache = createManifestCache();
        const reported = new Set();
        let scope = UNSCOPED;
        let allowTokens = [];
        let skipColorLiterals = true;
        const emit = (findings) => {
            for (const finding of findings) {
                if (reported.has(finding.node))
                    continue;
                reported.add(finding.node);
                context.report({
                    node: finding.node,
                    messageId: "arbitraryValue",
                    data: { token: finding.token, value: finding.value },
                });
            }
        };
        return {
            before() {
                const options = firstOptionRecord(context.options);
                scope = scopeOf({ cwd: context.cwd, filename: context.filename, options, cache });
                allowTokens = stringListOption(options, ALLOW_TOKENS_OPTION);
                skipColorLiterals = options[SKIP_COLORS_OPTION] !== false;
                reported.clear();
                const allowPaths = stringListOption(options, ALLOW_PATHS_OPTION);
                if (allowPaths.some((pattern) => scope.path.startsWith(pattern)))
                    return false;
            },
            JSXOpeningElement(node) {
                emit(arbitraryFindings({ classes: classAttributesOf(node), allowTokens, skipColorLiterals }));
            },
            CallExpression(node) {
                emit(arbitraryFindings({ classes: classStringsIn(node), allowTokens, skipColorLiterals }));
            },
        };
    },
});
