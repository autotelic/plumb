import type { SourceCode } from "@oxlint/plugins";
/** Where a component sits in the tier pipeline. */
export type CatalogTier = "primitive" | "shared" | "local";
/** One component as the catalog classified it. */
export interface CatalogComponent {
    readonly path: string;
    readonly name: string;
    readonly tier: CatalogTier;
    readonly owners: readonly string[];
    readonly props: readonly string[];
    readonly tags: readonly string[];
}
/** The whole manifest: token vocabulary, tier roots, and the component graph. */
export interface UiManifest {
    readonly colors: readonly string[];
    readonly sharedRoots: readonly string[];
    readonly localRoots: readonly string[];
    readonly components: readonly CatalogComponent[];
}
/** A manifest for projects that generate no catalog: every tier rule stays silent. */
export declare const EMPTY_MANIFEST: UiManifest;
/** Two components compared for near-duplication. */
export interface DuplicatePair {
    readonly left: CatalogComponent;
    readonly right: CatalogComponent;
}
/** A manifest file to resolve, memoized through the session's cache. */
export interface ManifestQuery {
    readonly source: ManifestSource;
    readonly cache: ManifestCache;
}
/** A manifest file's path and the working directory to resolve it against. */
export interface ManifestSource {
    readonly path: string;
    readonly cwd: string;
}
/** Per-session manifest cache, owned by the rule that reads the manifest. */
export interface ManifestCache {
    readonly entries: Map<string, UiManifest>;
}
/** The subject component, the manifest to search, and the score threshold. */
export interface DuplicateQuery {
    readonly manifest: UiManifest;
    readonly component: CatalogComponent;
    readonly threshold: number;
}
/** The nearest higher-tier twin of a component. */
export interface DuplicateMatch {
    readonly component: CatalogComponent;
    readonly score: number;
}
/** A linting file's location, reduced to what catalog matching needs. */
export interface FileLocation {
    readonly cwd: string;
    readonly filename: string;
}
/** A file path looked up in a manifest. */
export interface PathLookup {
    readonly manifest: UiManifest;
    readonly path: string;
}
/**
 * Create the per-session manifest cache a rule holds in its own closure.
 *
 * @returns {ManifestCache} An empty cache.
 */
export declare function createManifestCache(): ManifestCache;
/**
 * Decode a manifest document. Malformed input decodes to the empty manifest, so
 * a stale or hand-edited catalog degrades to silence rather than false findings.
 *
 * @param {string} text - The manifest's JSON text.
 * @returns {UiManifest} The decoded manifest, empty when the text is unusable.
 */
export declare function parseManifest(text: string): UiManifest;
/**
 * Read and decode the manifest at a path, memoized per resolved path.
 *
 * @param {ManifestQuery} query - The manifest path, the working directory, and the session cache.
 * @returns {UiManifest} The decoded manifest, empty when the file is absent or unreadable.
 */
export declare function loadManifest(query: ManifestQuery): UiManifest;
/**
 * Reduce a path to the repository-relative, forward-slashed form the catalog uses.
 *
 * @param {FileLocation} location - The linting working directory and the linted filename.
 * @returns {string} The normalized repository-relative path.
 */
export declare function relativePathOf(location: FileLocation): string;
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
export declare function withLocalRoots(manifest: UiManifest, roots: readonly string[]): UiManifest;
/**
 * The catalog entry describing a file, matched by exact path then by suffix.
 *
 * @param {PathLookup} lookup - The manifest and the normalized file path.
 * @returns {CatalogComponent | null} The entry, or null when the file is not in the catalog.
 */
export declare function entryAt(lookup: PathLookup): CatalogComponent | null;
/**
 * Whether a path lives under one of the manifest's shared roots.
 *
 * @param {PathLookup} lookup - The manifest and the normalized file path.
 * @returns {boolean} True when the path sits in shared-component territory.
 */
export declare function isUnderSharedRoot(lookup: PathLookup): boolean;
/**
 * The comparable surface of a component: its prop names plus its rendered tags.
 *
 * @param {CatalogComponent} component - The catalog entry.
 * @returns {ReadonlySet<string>} The normalized signature.
 */
export declare function signatureOf(component: CatalogComponent): ReadonlySet<string>;
/**
 * Jaccard overlap of two component signatures.
 *
 * @param {DuplicatePair} pair - The components compared.
 * @returns {number} The overlap in [0, 1]; two empty signatures are not similar.
 */
export declare function similarity(pair: DuplicatePair): number;
/**
 * The nearest twin of a component in another tier, at or above the threshold.
 *
 * @param {DuplicateQuery} query - The manifest, the subject component, and the score threshold.
 * @returns {DuplicateMatch | null} The closest twin, or null when nothing is close enough.
 */
export declare function nearestDuplicate(query: DuplicateQuery): DuplicateMatch | null;
/**
 * Whether a module carries a documentation block for the catalog to read.
 *
 * @param {SourceCode} sourceCode - The rule's source-code accessor.
 * @returns {boolean} True when at least one JSDoc block is present.
 */
export declare function isDocumented(sourceCode: SourceCode): boolean;
