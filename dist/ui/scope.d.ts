import type { ManifestCache, UiManifest } from "./manifest.ts";
import type { OptionRecord } from "../shared/rule-options.ts";
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
 * Resolve everything a UI rule needs to judge one file.
 *
 * @param {ScopeQuery} query - The file location, options, and session cache.
 * @returns {FileScope} The file's scope; rules skip non-JSX files themselves.
 */
export declare function scopeOf(query: ScopeQuery): FileScope;
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
export declare function isExemptPath(exemption: PathExemption): boolean;
