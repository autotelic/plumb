import type { CatalogComponent, UiManifest } from "../manifest.ts";
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
export declare function duplicateVerdict(query: {
    readonly entry: CatalogComponent | null;
    readonly manifest: UiManifest;
    readonly threshold: number;
}): DuplicateVerdict | null;
/**
 * A local copy of a shared component is two sources of truth for one idea.
 *
 * The catalog derives both components' signatures, so this rule does not guess:
 * the finding is a measured overlap between a local component's props and tags
 * and an existing shared component's. Deleting the copy is usually the whole fix
 * — the shared component already does the job, and the second caller is what
 * makes it the blessed one.
 */
export declare const noLocalCopyOfSharedRule: import("@oxlint/plugins").Rule;
