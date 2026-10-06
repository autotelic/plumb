import type { ESTree } from "@oxlint/plugins";
import type { FileScope } from "../scope.ts";
import type { ClassString } from "../tokens.ts";
/** What kind of color violation a class string carries. */
export type ColorViolation = "arbitrary" | "family";
/** One off-token color finding, resolved but not yet reported. */
export interface ColorFinding {
    readonly node: ESTree.Node;
    readonly violation: ColorViolation;
    readonly token: string;
    readonly family: string;
}
/** One class string plus the vocabulary it is judged against. */
export interface ColorAudit {
    readonly classes: readonly ClassString[];
    readonly scope: FileScope;
    readonly allowTokens: readonly string[];
    readonly reportArbitrary: boolean;
}
/**
 * The declared vocabulary, phrased for a report message.
 *
 * @param {FileScope} scope - The file's resolved scope.
 * @returns {string} The declared families, or an empty string when none are declared.
 */
export declare function vocabularyLabel(scope: FileScope): string;
/**
 * Every off-token color a set of class strings carries.
 *
 * @param {ColorAudit} audit - The class strings, the declared families, and the exemptions.
 * @returns {readonly ColorFinding[]} One finding per offending utility token.
 */
export declare function colorFindings(audit: ColorAudit): readonly ColorFinding[];
/**
 * Colors come from the token set, not from the engine's built-in palette.
 *
 * A generic neutral or a rainbow utility is not a styling choice, it is a design
 * decision made at the keyboard: the palette the project declared is bypassed, and
 * the drift stays invisible because every such class type-checks. Families come
 * from the `colors` option or the generated manifest; neutral families
 * (black/white/current/transparent) stay legal everywhere.
 */
export declare const noOffTokenColorRule: import("@oxlint/plugins").Rule;
