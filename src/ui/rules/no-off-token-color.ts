import { defineRule } from "@oxlint/plugins";

import { EMPTY_MANIFEST, createManifestCache } from "../manifest.ts";
import {
	classAttributesOf,
	classStringsIn,
	colorFamilyOf,
	isArbitraryColor,
	isOffTokenFamily,
	utilitiesIn,
	utilityOf,
} from "../tokens.ts";
import { scopeOf } from "../scope.ts";
import { firstOptionRecord, stringListOption } from "../../shared/rule-options.ts";

import type { ESTree } from "@oxlint/plugins";
import type { FileScope } from "../scope.ts";
import type { ClassString } from "../tokens.ts";

/** Option key listing path prefixes exempt from the rule. */
const ALLOW_PATHS_OPTION = "allowPaths";

/** Option key listing utility prefixes that stay legal. */
const ALLOW_TOKENS_OPTION = "allowTokens";

/** Option key switching off reports for arbitrary color literals. */
const ARBITRARY_OPTION = "reportArbitraryColors";

/** What kind of color violation a class string carries. */
export type ColorViolation = "arbitrary" | "family";

/** One off-token color finding, resolved but not yet reported. */
export interface ColorFinding {
	readonly node: ESTree.Node;
	readonly violation: ColorViolation;
	readonly token: string;
	readonly family: string;
}

/** One class string plus the vocabulary it is judged against. */
export interface ColorAudit {
	readonly classes: readonly ClassString[];
	readonly scope: FileScope;
	readonly allowTokens: readonly string[];
	readonly reportArbitrary: boolean;
}

/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED: FileScope = { path: "", isJsx: false, colors: [], manifest: EMPTY_MANIFEST };

/**
 * The declared vocabulary, phrased for a report message.
 *
 * @param {FileScope} scope - The file's resolved scope.
 * @returns {string} The declared families, or an empty string when none are declared.
 */
export function vocabularyLabel(scope: FileScope): string {
	return scope.colors.length === 0 ? "" : ` (declared families: ${scope.colors.join(", ")})`;
}

/**
 * Every off-token color a set of class strings carries.
 *
 * @param {ColorAudit} audit - The class strings, the declared families, and the exemptions.
 * @returns {readonly ColorFinding[]} One finding per offending utility token.
 */
export function colorFindings(audit: ColorAudit): readonly ColorFinding[] {
	const findings: ColorFinding[] = [];
	for (const hit of utilitiesIn({ classes: audit.classes, allowTokens: audit.allowTokens })) {
		const utility = utilityOf(hit.token);
		const family = colorFamilyOf(utility);
		if (family === null) continue;
		if (isArbitraryColor(utility)) {
			if (audit.reportArbitrary) findings.push({ node: hit.node, violation: "arbitrary", token: hit.token, family });
			continue;
		}
		if (isOffTokenFamily({ family, allowed: audit.scope.colors })) {
			findings.push({ node: hit.node, violation: "family", token: hit.token, family });
		}
	}
	return findings;
}

/**
 * Colors come from the token set, not from the engine's built-in palette.
 *
 * A generic neutral or a rainbow utility is not a styling choice, it is a design
 * decision made at the keyboard: the palette the project declared is bypassed, and
 * the drift stays invisible because every such class type-checks. Families come
 * from the `colors` option or the generated manifest; neutral families
 * (black/white/current/transparent) stay legal everywhere.
 */
export const noOffTokenColorRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow color utilities outside the design system's token families; name a token family instead of the engine's built-in palette.",
		},
		messages: {
			offTokenColor:
				"`{{token}}` uses the off-token color family `{{family}}`. Use a token from the design system{{label}}.",
			arbitraryColor:
				"`{{token}}` spells a color literal instead of naming a token. Use a token from the design system{{label}}.",
		},
		schema: [
			{
				type: "object",
				properties: {
					manifest: { type: "string" },
					colors: { type: "array", items: { type: "string" } },
					allowPaths: { type: "array", items: { type: "string" } },
					allowTokens: { type: "array", items: { type: "string" } },
					reportArbitraryColors: { type: "boolean" },
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
		let reportArbitrary = true;

		const emit = (findings: readonly ColorFinding[]): void => {
			for (const finding of findings) {
				if (reported.has(finding.node)) continue;
				reported.add(finding.node);
				if (finding.violation === "family") {
					context.report({
						node: finding.node,
						messageId: "offTokenColor",
						data: { token: finding.token, family: finding.family, label: vocabularyLabel(scope) },
					});
					continue;
				}
				context.report({
					node: finding.node,
					messageId: "arbitraryColor",
					data: { token: finding.token, label: vocabularyLabel(scope) },
				});
			}
		};

		return {
			before() {
				const options = firstOptionRecord(context.options);
				scope = scopeOf({ cwd: context.cwd, filename: context.filename, options, cache });
				allowTokens = stringListOption(options, ALLOW_TOKENS_OPTION);
				reportArbitrary = options[ARBITRARY_OPTION] !== false;
				reported.clear();
				const allowPaths = stringListOption(options, ALLOW_PATHS_OPTION);
				if (allowPaths.some((pattern) => scope.path.startsWith(pattern))) return false;
			},
			JSXOpeningElement(node) {
				emit(colorFindings({ classes: classAttributesOf(node), scope, allowTokens, reportArbitrary }));
			},
			CallExpression(node) {
				emit(colorFindings({ classes: classStringsIn(node), scope, allowTokens, reportArbitrary }));
			},
		};
	},
});