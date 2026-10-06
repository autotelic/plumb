import type { CatalogComponent, UiManifest } from "../manifest.ts";
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
export declare function misplacedVerdict(query: {
    readonly entry: CatalogComponent | null;
    readonly manifest: UiManifest;
    readonly path: string;
}): MisplacedVerdict | null;
/**
 * A one-owner component in the shared namespace advertises a promise it cannot keep.
 *
 * The catalog already knows this component has exactly one route owner, so the
 * shared directory is claiming reach it does not have: the next author imports it
 * as if it were a promise, and the tier pipeline stops being a pipeline. Moving
 * it costs one import; leaving it costs the whole menu's credibility.
 */
export declare const noMisplacedLocalRule: import("@oxlint/plugins").Rule;
