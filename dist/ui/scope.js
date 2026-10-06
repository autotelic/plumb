import { EMPTY_MANIFEST, loadManifest, relativePathOf } from "./manifest.js";
import { isAllowlisted } from "./tokens.js";
import { stringListOption, stringOption } from "../shared/rule-options.js";
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
/**
 * Resolve the manifest configured for this run, if any.
 *
 * @param {ScopeQuery} query - The file location, options, and session cache.
 * @returns {UiManifest} The decoded manifest, empty when none is configured.
 */
function manifestOf(query) {
    const path = stringOption(query.options, MANIFEST_OPTION);
    if (path === null || path === "")
        return EMPTY_MANIFEST;
    return loadManifest({ source: { path, cwd: query.cwd }, cache: query.cache });
}
/**
 * Resolve everything a UI rule needs to judge one file.
 *
 * @param {ScopeQuery} query - The file location, options, and session cache.
 * @returns {FileScope} The file's scope; rules skip non-JSX files themselves.
 */
export function scopeOf(query) {
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
export function isExemptPath(exemption) {
    return isAllowlisted({ subject: exemption.scope.path, patterns: exemption.patterns });
}
