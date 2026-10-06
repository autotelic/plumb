import type { ESTree } from "@oxlint/plugins";
import type { TagPolicy } from "../elements.ts";
/** Whether a tag should be reported, and which primitive replaces it. */
export interface LayoutVerdict {
    readonly primitive: string;
    readonly report: boolean;
}
/** A JSX element plus the tag policy configured for the project. */
export type LayoutPolicy = TagPolicy;
/**
 * The primitive a raw layout tag should be, or no finding at all.
 *
 * @param {{ readonly node: ESTree.JSXOpeningElement; readonly policy: LayoutPolicy }} query - The element and the configured policy.
 * @returns {LayoutVerdict} Whether to report, and the primitive that replaces the tag.
 */
export declare function layoutVerdict(query: {
    readonly node: ESTree.JSXOpeningElement;
    readonly policy: LayoutPolicy;
}): LayoutVerdict;
/**
 * Raw layout tags are the design system's escape hatch.
 *
 * The primitives exist so spacing, colour, and semantics arrive through one
 * typed surface. A bare `<div className="p-4">` skips all of it and still
 * type-checks, which is exactly why it wins: it is the path of least resistance.
 * Projects enable this rule once the primitives they point at exist, and widen
 * its scope as the finding count falls.
 */
export declare const noRawHtmlLayoutRule: import("@oxlint/plugins").Rule;
