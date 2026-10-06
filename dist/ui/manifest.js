import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAllComments, isRecordObject, isString, readField } from "../shared/structural.js";
/** A manifest for projects that generate no catalog: every tier rule stays silent. */
export const EMPTY_MANIFEST = {
    colors: [],
    sharedRoots: [],
    localRoots: [],
    components: [],
};
/**
 * Create the per-session manifest cache a rule holds in its own closure.
 *
 * @returns {ManifestCache} An empty cache.
 */
export function createManifestCache() {
    return { entries: new Map() };
}
/**
 * Whether a decoded value names one of the manifest's tiers.
 *
 * @param {NodeFieldValue} value - The decoded `tier` field.
 * @returns {boolean} True when the value names a tier.
 */
function isTier(value) {
    return value === "primitive" || value === "shared" || value === "local";
}
/**
 * The string members of a decoded array field, absent when malformed.
 *
 * @param {NodeFieldValue} value - The decoded field.
 * @returns {readonly string[]} The string members, or an empty list.
 */
function readStringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter(isString);
}
/**
 * One catalog entry, or null when the decoded object lacks the required fields.
 *
 * @param {NodeFieldValue} value - The decoded component entry.
 * @returns {CatalogComponent | null} The entry, or null when it is unusable.
 */
function readComponent(value) {
    if (!isRecordObject(value))
        return null;
    const path = readField(value, "path");
    const name = readField(value, "name");
    const tier = readField(value, "tier");
    if (!isString(path) || !isString(name) || !isTier(tier))
        return null;
    return {
        path,
        name,
        tier,
        owners: readStringList(readField(value, "owners")),
        props: readStringList(readField(value, "props")),
        tags: readStringList(readField(value, "tags")),
    };
}
/**
 * Parse a JSON document without letting a malformed manifest crash a lint run.
 *
 * @param {string} text - The manifest's JSON text.
 * @returns {NodeFieldValue} The parsed document, or null when the text is not JSON.
 */
function decodeJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
/**
 * Decode a manifest document. Malformed input decodes to the empty manifest, so
 * a stale or hand-edited catalog degrades to silence rather than false findings.
 *
 * @param {string} text - The manifest's JSON text.
 * @returns {UiManifest} The decoded manifest, empty when the text is unusable.
 */
export function parseManifest(text) {
    const decoded = decodeJson(text);
    if (!isRecordObject(decoded))
        return EMPTY_MANIFEST;
    const entries = [];
    const rawComponents = readField(decoded, "components");
    if (Array.isArray(rawComponents)) {
        for (const entry of rawComponents) {
            const component = readComponent(entry);
            if (component !== null)
                entries.push(component);
        }
    }
    return {
        colors: readStringList(readField(decoded, "colors")),
        sharedRoots: readStringList(readField(decoded, "sharedRoots")),
        localRoots: readStringList(readField(decoded, "localRoots")),
        components: entries,
    };
}
/**
 * Read and decode the manifest at a path, memoized per resolved path.
 *
 * @param {ManifestQuery} query - The manifest path, the working directory, and the session cache.
 * @returns {UiManifest} The decoded manifest, empty when the file is absent or unreadable.
 */
export function loadManifest(query) {
    const resolved = resolve(query.source.cwd, query.source.path);
    const cached = query.cache.entries.get(resolved);
    if (cached !== undefined)
        return cached;
    let text = "";
    try {
        text = readFileSync(resolved, "utf8");
    }
    catch {
        text = "";
    }
    const manifest = parseManifest(text);
    query.cache.entries.set(resolved, manifest);
    return manifest;
}
/**
 * Reduce a path to the repository-relative, forward-slashed form the catalog uses.
 *
 * @param {FileLocation} location - The linting working directory and the linted filename.
 * @returns {string} The normalized repository-relative path.
 */
export function relativePathOf(location) {
    const file = location.filename.replaceAll("\\", "/");
    const root = location.cwd.replaceAll("\\", "/").replace(/\/$/u, "");
    const relative = file.startsWith(root) ? file.slice(root.length) : file;
    return relative.replace(/^\.\//u, "").replace(/^\/+/u, "");
}
/**
 * A manifest whose local roots come from configuration when it declares none.
 *
 * The generated manifest is authoritative; the option exists so a project can
 * adopt the rule before the generator emits that field.
 *
 * @param {UiManifest} manifest - The decoded manifest.
 * @param {readonly string[]} roots - Configured local-component roots.
 * @returns {UiManifest} The manifest with local roots filled in when it declared none.
 */
export function withLocalRoots(manifest, roots) {
    if (roots.length === 0 || manifest.localRoots.length > 0)
        return manifest;
    return { ...manifest, localRoots: roots };
}
/**
 * The catalog entry describing a file, matched by exact path then by suffix.
 *
 * @param {PathLookup} lookup - The manifest and the normalized file path.
 * @returns {CatalogComponent | null} The entry, or null when the file is not in the catalog.
 */
export function entryAt(lookup) {
    for (const component of lookup.manifest.components) {
        if (component.path === lookup.path)
            return component;
    }
    for (const component of lookup.manifest.components) {
        if (lookup.path.endsWith(`/${component.path}`) || component.path.endsWith(`/${lookup.path}`))
            return component;
    }
    return null;
}
/**
 * Whether a path lives under one of the manifest's shared roots.
 *
 * @param {PathLookup} lookup - The manifest and the normalized file path.
 * @returns {boolean} True when the path sits in shared-component territory.
 */
export function isUnderSharedRoot(lookup) {
    return lookup.manifest.sharedRoots.some((root) => lookup.path === root || lookup.path.startsWith(`${root}/`));
}
/**
 * The comparable surface of a component: its prop names plus its rendered tags.
 *
 * @param {CatalogComponent} component - The catalog entry.
 * @returns {ReadonlySet<string>} The normalized signature.
 */
export function signatureOf(component) {
    return new Set([...component.props, ...component.tags]);
}
/**
 * Jaccard overlap of two component signatures.
 *
 * @param {DuplicatePair} pair - The components compared.
 * @returns {number} The overlap in [0, 1]; two empty signatures are not similar.
 */
export function similarity(pair) {
    const left = signatureOf(pair.left);
    const right = signatureOf(pair.right);
    if (left.size === 0 || right.size === 0)
        return 0;
    let shared = 0;
    for (const member of left)
        if (right.has(member))
            shared += 1;
    return shared / (left.size + right.size - shared);
}
/**
 * The nearest twin of a component in another tier, at or above the threshold.
 *
 * @param {DuplicateQuery} query - The manifest, the subject component, and the score threshold.
 * @returns {DuplicateMatch | null} The closest twin, or null when nothing is close enough.
 */
export function nearestDuplicate(query) {
    let best = null;
    for (const candidate of query.manifest.components) {
        if (candidate.path === query.component.path)
            continue;
        if (candidate.tier === query.component.tier)
            continue;
        const score = similarity({ left: query.component, right: candidate });
        if (score < query.threshold)
            continue;
        if (best === null || score > best.score)
            best = { component: candidate, score };
    }
    return best;
}
/**
 * Whether a module carries a documentation block for the catalog to read.
 *
 * @param {SourceCode} sourceCode - The rule's source-code accessor.
 * @returns {boolean} True when at least one JSDoc block is present.
 */
export function isDocumented(sourceCode) {
    return getAllComments(sourceCode).some((comment) => comment.type === "Block" && comment.value.startsWith("*"));
}
