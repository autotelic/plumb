import { defineRule } from "@oxlint/plugins";

import {
	arbitraryValueOf,
	classAttributesOf,
	classStringsIn,
	isArbitraryColor,
	utilitiesIn,
	utilityOf,
} from "../tokens.ts";
import { EMPTY_MANIFEST, createManifestCache } from "../manifest.ts";
import { scopeOf } from "../scope.ts";
import { firstOptionRecord, stringListOption } from "../../shared/rule-options.ts";

import type { ESTree } from "@oxlint/plugins";
import type { FileScope } from "../scope.ts";
import type { ClassString } from "../tokens.ts";

/** Option key listing path prefixes exempt from the rule. */
const ALLOW_PATHS_OPTION = "allowPaths";

/** Option key listing utility prefixes that stay legal. */
const ALLOW_TOKENS_OPTION = "allowTokens";

/** Option key handing arbitrary color literals to `no-off-token-color`. */
const SKIP_COLORS_OPTION = "skipColorLiterals";

/** One arbitrary value, resolved but not yet reported. */
export interface ArbitraryFinding {
	readonly node: ESTree.Node;
	readonly token: string;
	readonly value: string;
}

/** Class strings plus the exemptions applied while scanning them. */
export interface ArbitraryScan {
	readonly classes: readonly ClassString[];
	readonly allowTokens: readonly string[];
	readonly skipColorLiterals: boolean;
}

/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED: FileScope = { path: "", isJsx: false, colors: [], manifest: EMPTY_MANIFEST };

/**
 * Every arbitrary value a set of class strings spells out.
 *
 * @param {ArbitraryScan} scan - The class strings and the exemptions to apply.
 * @returns {readonly ArbitraryFinding[]} One finding per arbitrary utility token.
 */
export function arbitraryFindings(scan: ArbitraryScan): readonly ArbitraryFinding[] {
	const findings: ArbitraryFinding[] = [];
	for (const hit of utilitiesIn({ classes: scan.classes, allowTokens: scan.allowTokens })) {
		const utility = utilityOf(hit.token);
		if (scan.skipColorLiterals && isArbitraryColor(utility)) continue;
		const value = arbitraryValueOf(utility);
		if (value === null) continue;
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
			description:
				"Disallow arbitrary values in class names; add a token or use a scale step instead of a one-off literal.",
		},
		messages: {
			arbitraryValue:
				"`{{token}}` hard-codes `{{value}}` outside the token scale. Add a token, use a scale step, or allowlist the utility prefix in configuration.",
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
		const reported = new Set<ESTree.Node>();
		let scope: FileScope = UNSCOPED;
		let allowTokens: readonly string[] = [];
		let skipColorLiterals = true;

		const emit = (findings: readonly ArbitraryFinding[]): void => {
			for (const finding of findings) {
				if (reported.has(finding.node)) continue;
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
				if (allowPaths.some((pattern) => scope.path.startsWith(pattern))) return false;
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