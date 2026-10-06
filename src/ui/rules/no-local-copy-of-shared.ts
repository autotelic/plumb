import { defineRule } from "@oxlint/plugins";

import { createManifestCache, entryAt, nearestDuplicate } from "../manifest.ts";
import { scopeOf } from "../scope.ts";
import { firstOptionRecord, numberOption } from "../../shared/rule-options.ts";

import type { ESTree } from "@oxlint/plugins";
import type { CatalogComponent, UiManifest } from "../manifest.ts";
import type { FileScope } from "../scope.ts";

/** Signature overlap at or above which two components are the same component. */
const DEFAULT_THRESHOLD = 0.8;

/** Option key overriding the near-duplicate score threshold. */
const THRESHOLD_OPTION = "threshold";

/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED: FileScope = {
	path: "",
	isJsx: false,
	colors: [],
	manifest: { colors: [], sharedRoots: [], localRoots: [], components: [] },
};

/** A local component that a shared component already covers. */
export interface DuplicateVerdict {
	readonly local: CatalogComponent;
	readonly shared: CatalogComponent;
	readonly score: number;
}

/**
 * Whether a catalog entry is a local component that shadows a shared one.
 *
 * @param {{ readonly entry: CatalogComponent | null; readonly manifest: UiManifest; readonly threshold: number }} query - The entry, the manifest, and the score threshold.
 * @returns {DuplicateVerdict | null} The pair to report, or null when the entry is unique.
 */
export function duplicateVerdict(query: {
	readonly entry: CatalogComponent | null;
	readonly manifest: UiManifest;
	readonly threshold: number;
}): DuplicateVerdict | null {
	if (query.entry === null || query.entry.tier !== "local") return null;
	const match = nearestDuplicate({
		manifest: query.manifest,
		component: query.entry,
		threshold: query.threshold,
	});
	if (match === null || match.component.tier !== "shared") return null;
	return { local: query.entry, shared: match.component, score: match.score };
}

/**
 * A local copy of a shared component is two sources of truth for one idea.
 *
 * The catalog derives both components' signatures, so this rule does not guess:
 * the finding is a measured overlap between a local component's props and tags
 * and an existing shared component's. Deleting the copy is usually the whole fix
 * — the shared component already does the job, and the second caller is what
 * makes it the blessed one.
 */
export const noLocalCopyOfSharedRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow local components whose signature duplicates a shared component; import the shared one instead.",
		},
		messages: {
			localCopyOfShared:
				"Local component `{{local}}` duplicates shared `{{shared}}` (signature overlap {{score}}). Delete the local copy and import the shared component; if a second caller now needs it, promote the shared one.",
		},
		schema: [
			{
				type: "object",
				properties: {
					manifest: { type: "string" },
					threshold: { type: "number" },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{}],
	},
	createOnce(context) {
		const cache = createManifestCache();
		let scope: FileScope = UNSCOPED;
		let threshold = DEFAULT_THRESHOLD;
		let entry: CatalogComponent | null = null;

		return {
			before() {
				const options = firstOptionRecord(context.options);
				scope = scopeOf({ cwd: context.cwd, filename: context.filename, options, cache });
				threshold = numberOption(options, THRESHOLD_OPTION) ?? DEFAULT_THRESHOLD;
				entry = entryAt({ manifest: scope.manifest, path: scope.path });
				if (entry === null) return false;
			},
			"Program:exit"(node: ESTree.Program) {
				const verdict = duplicateVerdict({ entry, manifest: scope.manifest, threshold });
				if (verdict === null) return;
				context.report({
					node,
					messageId: "localCopyOfShared",
					data: {
						local: verdict.local.name,
						shared: `${verdict.shared.path} (${verdict.shared.name})`,
						score: verdict.score.toFixed(2),
					},
				});
			},
		};
	},
});