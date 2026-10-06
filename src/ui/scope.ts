import { EMPTY_MANIFEST, loadManifest, relativePathOf } from "./manifest.ts";
import { isAllowlisted } from "./tokens.ts";
import { stringListOption, stringOption } from "../shared/rule-options.ts";

import type { ManifestCache, UiManifest } from "./manifest.ts";
import type { OptionRecord } from "../shared/rule-options.ts";

/*
 * Per-file scope for the `plumb-ui` rules.
 *
 * Every UI rule needs the same three facts before it can report: is this a JSX
 * module, which path does the catalog know it by, and which token families does
 * the manifest declare. Resolving them once, here, keeps each rule to its own
 * judgement and keeps the option vocabulary identical across the plugin.
 */

/** Extensions whose class names and tags the UI rules own. */
const JSX_FILE = /\.[jt]sx$/u;

/** Option key naming a generated manifest path. */
const MANIFEST_OPTION = "manifest";

/** The linted file's location plus the rule's decoded options. */
export interface ScopeQuery {
	readonly cwd: string;
	readonly filename: string;
	readonly options: OptionRecord;
	readonly cache: ManifestCache;
}

/** Everything a UI rule decides once per file. */
export interface FileScope {
	readonly path: string;
	readonly isJsx: boolean;
	readonly colors: readonly string[];
	readonly manifest: UiManifest;
}

/** A file scope matched against configured path allowlist patterns. */
export interface PathExemption {
	readonly scope: FileScope;
	readonly patterns: readonly string[];
}

/**
 * Resolve the manifest configured for this run, if any.
 *
 * @param {ScopeQuery} query - The file location, options, and session cache.
 * @returns {UiManifest} The decoded manifest, empty when none is configured.
 */
function manifestOf(query: ScopeQuery): UiManifest {
	const path = stringOption(query.options, MANIFEST_OPTION);
	if (path === null || path === "") return EMPTY_MANIFEST;
	return loadManifest({ source: { path, cwd: query.cwd }, cache: query.cache });
}

/**
 * Resolve everything a UI rule needs to judge one file.
 *
 * @param {ScopeQuery} query - The file location, options, and session cache.
 * @returns {FileScope} The file's scope; rules skip non-JSX files themselves.
 */
export function scopeOf(query: ScopeQuery): FileScope {
	const path = relativePathOf({ cwd: query.cwd, filename: query.filename });
	const manifest = manifestOf(query);
	return {
		path,
		isJsx: JSX_FILE.test(path),
		colors: [...stringListOption(query.options, "colors"), ...manifest.colors],
		manifest,
	};
}

/**
 * Whether configured allowlist patterns exempt this file from a rule.
 *
 * Escape hatches live in configuration, not in per-line disables: a growing
 * allowlist is a visible fact about the design system rather than a silent crack
 * in it.
 *
 * @param {PathExemption} exemption - The file scope and the configured patterns.
 * @returns {boolean} True when the file is exempt.
 */
export function isExemptPath(exemption: PathExemption): boolean {
	return isAllowlisted({ subject: exemption.scope.path, patterns: exemption.patterns });
}