import type { CatalogComponent } from "../manifest.ts";
/** Whether a component's file owes the menu a documented contract. */
export interface EntryVerdict {
    readonly entry: CatalogComponent;
    readonly owners: readonly string[];
}
/**
 * The shared component whose file must carry a documented contract.
 *
 * @param {{ readonly entry: CatalogComponent | null; readonly minOwners: number }} query - The entry and the owner threshold.
 * @returns {EntryVerdict | null} The component to report, or null when it owes nothing.
 */
export declare function entryVerdict(query: {
    readonly entry: CatalogComponent | null;
    readonly minOwners: number;
}): EntryVerdict | null;
/**
 * A component two routes depend on is a contract, not an implementation detail.
 *
 * The generated menu reads a component's documentation to tell the next agent
 * when to use it and, just as importantly, when not to. A shared component with
 * no documented contract produces a menu entry with no negative space, which is
 * exactly what makes an agent reach for the wrong component: the silence reads
 * as permission.
 */
export declare const requireCatalogEntryRule: import("@oxlint/plugins").Rule;
