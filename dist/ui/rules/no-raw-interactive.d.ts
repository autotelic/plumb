import type { ESTree } from "@oxlint/plugins";
/** A JSX element plus the interactive-tag policy configured for the project. */
export interface InteractivePolicy {
    readonly tags: ReadonlySet<string>;
    readonly replacements: Readonly<Record<string, string>>;
    readonly allowNames: readonly string[];
}
/** Whether a raw interactive element should be reported, and what replaces it. */
export interface InteractiveVerdict {
    readonly primitive: string;
    readonly report: boolean;
}
/**
 * The primitive a raw interactive element should be, or no finding at all.
 *
 * @param {{ readonly node: ESTree.JSXOpeningElement; readonly policy: InteractivePolicy }} query - The element and the configured policy.
 * @returns {InteractiveVerdict} Whether to report, and the primitive that replaces the tag.
 */
export declare function interactiveVerdict(query: {
    readonly node: ESTree.JSXOpeningElement;
    readonly policy: InteractivePolicy;
}): InteractiveVerdict;
/**
 * Raw interactive elements carry behaviour no design system has approved.
 *
 * A `<button className="...">` picks its own focus ring, disabled treatment, and
 * keyboard semantics; the primitive is where those are decided once. Escape
 * hatches are configuration — `allowPaths` names the primitive modules
 * themselves — so the exemption list stays a reviewable fact about the system
 * rather than a pile of inline disables.
 */
export declare const noRawInteractiveRule: import("@oxlint/plugins").Rule;
