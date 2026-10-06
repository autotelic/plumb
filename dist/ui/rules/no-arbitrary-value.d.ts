import type { ESTree } from "@oxlint/plugins";
import type { ClassString } from "../tokens.ts";
/** One arbitrary value, resolved but not yet reported. */
export interface ArbitraryFinding {
    readonly node: ESTree.Node;
    readonly token: string;
    readonly value: string;
}
/** Class strings plus the exemptions applied while scanning them. */
export interface ArbitraryScan {
    readonly classes: readonly ClassString[];
    readonly allowTokens: readonly string[];
    readonly skipColorLiterals: boolean;
}
/**
 * Every arbitrary value a set of class strings spells out.
 *
 * @param {ArbitraryScan} scan - The class strings and the exemptions to apply.
 * @returns {readonly ArbitraryFinding[]} One finding per arbitrary utility token.
 */
export declare function arbitraryFindings(scan: ArbitraryScan): readonly ArbitraryFinding[];
/**
 * An arbitrary value is a design decision smuggled past review.
 *
 * `p-[17px]` reads like a spacing choice but is a one-off: it has no name, no
 * owner, and no place in the scale, so the next author copies it instead of
 * reaching for the token that should exist. The legitimate arbitrary values
 * (variant selectors, grid templates) are named in `allowTokens` rather than
 * left to per-line disables.
 */
export declare const noArbitraryValueRule: import("@oxlint/plugins").Rule;
