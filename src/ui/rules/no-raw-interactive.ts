import { defineRule } from "@oxlint/plugins";

import { EMPTY_MANIFEST, createManifestCache } from "../manifest.ts";
import { intrinsicNameOf, isPathExempt, resolveTagPolicy } from "../elements.ts";
import { scopeOf } from "../scope.ts";
import { firstOptionRecord } from "../../shared/rule-options.ts";

import type { ESTree } from "@oxlint/plugins";
import type { TagPolicy } from "../elements.ts";
import type { FileScope } from "../scope.ts";

/** Interactive elements whose behaviour and styling belong to primitives. */
const DEFAULT_INTERACTIVE_TAGS: readonly string[] = ["a", "button", "input", "select", "textarea"];

/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED: FileScope = { path: "", isJsx: false, colors: [], manifest: EMPTY_MANIFEST };

/** A JSX element plus the interactive-tag policy configured for the project. */
export type InteractivePolicy = TagPolicy;

/** Whether a raw interactive element should be reported, and what replaces it. */
export interface InteractiveVerdict {
	readonly primitive: string;
	readonly report: boolean;
}

/**
 * The primitive a raw interactive element should be, or no finding at all.
 *
 * @param {{ readonly node: ESTree.JSXOpeningElement; readonly policy: InteractivePolicy }} query - The element and the configured policy.
 * @returns {InteractiveVerdict} Whether to report, and the primitive that replaces the tag.
 */
export function interactiveVerdict(query: {
	readonly node: ESTree.JSXOpeningElement;
	readonly policy: InteractivePolicy;
}): InteractiveVerdict {
	const tag = intrinsicNameOf(query.node);
	if (tag === null || !query.policy.tags.has(tag)) return { primitive: "", report: false };
	if (query.policy.allowNames.includes(tag)) return { primitive: "", report: false };
	const configured = query.policy.replacements[tag];
	return { primitive: configured ?? "", report: true };
}

/**
 * The advice sentence for a raw interactive element.
 *
 * @param {string} primitive - The configured primitive, or the generic fallback.
 * @returns {string} The sentence appended to the finding.
 */
function adviceFor(primitive: string): string {
	const target = primitive === "" ? "the design system's matching primitive" : `\`<${primitive}>\``;
	return ` Use ${target}; the primitive decides focus, disabled, and keyboard behaviour once.`;
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
			description:
				"Disallow raw interactive elements outside primitive modules; use the design system's button, input, and link primitives.",
		},
		messages: {
			rawInteractiveTag:
				"`<{{tag}}>` is a raw interactive element.{{advice}}",
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
		let scope: FileScope = UNSCOPED;
		let policy: InteractivePolicy = {
			tags: new Set(DEFAULT_INTERACTIVE_TAGS),
			replacements: {},
			allowNames: [],
		};

		return {
			before() {
				const options = firstOptionRecord(context.options);
				scope = scopeOf({ cwd: context.cwd, filename: context.filename, options, cache });
				policy = resolveTagPolicy({ options, fallback: DEFAULT_INTERACTIVE_TAGS });
				if (!scope.isJsx) return false;
				if (isPathExempt({ options, path: scope.path })) return false;
			},
			JSXOpeningElement(node) {
				const verdict = interactiveVerdict({ node, policy });
				if (!verdict.report) return;
				context.report({
					node,
					messageId: "rawInteractiveTag",
					data: { tag: intrinsicNameOf(node) ?? "", advice: adviceFor(verdict.primitive) },
				});
			},
		};
	},
});