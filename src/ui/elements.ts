import { stringListOption, stringMapOption } from "../shared/rule-options.ts";

import type { ESTree } from "@oxlint/plugins";
import type { OptionRecord } from "../shared/rule-options.ts";

/*
 * JSX element naming and tag policy for the tag-level UI rules.
 *
 * A rule that bans raw tags must not fire on components: `<PageCard />` is the
 * design system's own vocabulary, `<div />` is the escape hatch. The
 * distinction is lexical — an intrinsic tag is a single lowercase identifier,
 * everything else is the project's own composition.
 *
 * Both tag rules read the same four options, so the policy is resolved once,
 * here, rather than decoded twice and left to drift.
 */

/** The banned tags, their replacements, and the names that stay raw. */
export interface TagPolicy {
	readonly tags: ReadonlySet<string>;
	readonly replacements: Readonly<Record<string, string>>;
	readonly allowNames: readonly string[];
}

/** Rule options plus the tags a project falls back to when it names none. */
export interface TagPolicyQuery {
	readonly options: OptionRecord;
	readonly fallback: readonly string[];
}

/**
 * The intrinsic tag a JSX element renders, or null when it is a component.
 *
 * @param {ESTree.JSXOpeningElement} node - The opening element.
 * @returns {string | null} The tag name, or null for components and member expressions.
 */
export function intrinsicNameOf(node: ESTree.JSXOpeningElement): string | null {
	if (node.name.type !== "JSXIdentifier") return null;
	return /^[a-z]/u.test(node.name.name) ? node.name.name : null;
}

/**
 * Resolve the tag policy a project's configuration declares.
 *
 * @param {TagPolicyQuery} query - The rule options and the default tag set.
 * @returns {TagPolicy} The resolved policy.
 */
export function resolveTagPolicy(query: TagPolicyQuery): TagPolicy {
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
export function isPathExempt(query: { readonly options: OptionRecord; readonly path: string }): boolean {
	return stringListOption(query.options, "allowPaths").some((pattern) => query.path.startsWith(pattern));
}