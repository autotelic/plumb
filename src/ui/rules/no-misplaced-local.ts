import { defineRule } from "@oxlint/plugins";

import { EMPTY_MANIFEST, createManifestCache, entryAt, isUnderSharedRoot, withLocalRoots } from "../manifest.ts";
import { scopeOf } from "../scope.ts";
import { firstOptionRecord, stringListOption } from "../../shared/rule-options.ts";

import type { ESTree } from "@oxlint/plugins";
import type { CatalogComponent, UiManifest } from "../manifest.ts";
import type { FileScope } from "../scope.ts";

/** Option key listing route roots local components belong under. */
const LOCAL_ROOTS_OPTION = "localRoots";

/** Option key listing path prefixes exempt from the rule. */
const ALLOW_PATHS_OPTION = "allowPaths";

/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED: FileScope = { path: "", isJsx: false, colors: [], manifest: EMPTY_MANIFEST };

/** A single-owner component sitting in shared-component territory. */
export interface MisplacedVerdict {
	readonly entry: CatalogComponent;
	readonly owner: string;
	readonly target: string;
}

/**
 * The route a single-owner component should live under instead of shared space.
 *
 * @param {{ readonly entry: CatalogComponent | null; readonly manifest: UiManifest; readonly path: string }} query - The entry, the manifest, and the file path.
 * @returns {MisplacedVerdict | null} The move to report, or null when the placement is right.
 */
export function misplacedVerdict(query: {
	readonly entry: CatalogComponent | null;
	readonly manifest: UiManifest;
	readonly path: string;
}): MisplacedVerdict | null {
	const entry = query.entry;
	if (entry === null || entry.tier !== "local") return null;
	if (!isUnderSharedRoot({ manifest: query.manifest, path: query.path })) return null;
	const owner = entry.owners[0];
	if (owner === undefined) return null;
	const root = query.manifest.localRoots[0] ?? "routes";
	return { entry, owner, target: `${root}/${owner}/components/${entry.name}.tsx` };
}

/**
 * A one-owner component in the shared namespace advertises a promise it cannot keep.
 *
 * The catalog already knows this component has exactly one route owner, so the
 * shared directory is claiming reach it does not have: the next author imports it
 * as if it were a promise, and the tier pipeline stops being a pipeline. Moving
 * it costs one import; leaving it costs the whole menu's credibility.
 */
export const noMisplacedLocalRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow single-owner components living in shared-component space; move them under their route's components directory.",
		},
		messages: {
			misplacedLocal:
				"`{{name}}` has one owner (`{{owner}}`) but lives in shared-component space. Move it to `{{target}}`, or give it a second owner and keep it shared.",
		},
		schema: [
			{
				type: "object",
				properties: {
					manifest: { type: "string" },
					localRoots: { type: "array", items: { type: "string" } },
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
		let entry: CatalogComponent | null = null;
		let manifest: UiManifest = EMPTY_MANIFEST;

		return {
			before() {
				const options = firstOptionRecord(context.options);
				scope = scopeOf({ cwd: context.cwd, filename: context.filename, options, cache });
				manifest = withLocalRoots(scope.manifest, stringListOption(options, LOCAL_ROOTS_OPTION));
				entry = entryAt({ manifest, path: scope.path });
				if (entry === null) return false;
				const allowPaths = stringListOption(options, ALLOW_PATHS_OPTION);
				if (allowPaths.some((pattern) => scope.path.startsWith(pattern))) return false;
			},
			"Program:exit"(node: ESTree.Program) {
				const verdict = misplacedVerdict({ entry, manifest, path: scope.path });
				if (verdict === null) return;
				context.report({
					node,
					messageId: "misplacedLocal",
					data: { name: verdict.entry.name, owner: verdict.owner, target: verdict.target },
				});
			},
		};
	},
});