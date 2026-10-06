import type { ESTree } from "@oxlint/plugins";
/** Tailwind's built-in palette families: legal in the engine, absent from most token manifests. */
export declare const DEFAULT_OFF_TOKEN_FAMILIES: ReadonlySet<string>;
/** A class-name source position: the literal and the node that carries it. */
export interface ClassString {
    readonly value: string;
    readonly node: ESTree.Node;
}
/** One step of a class-string walk: the node to read and the depth budget left. */
export interface WalkBudget {
    readonly node: ESTree.Node;
    readonly depth: number;
}
/** One bracket pair to read out of a utility. */
export interface BracketQuery {
    readonly utility: string;
    readonly open: string;
    readonly close: string;
}
/** An allowlist claim: the subject under test and the configured patterns. */
export interface AllowlistClaim {
    readonly subject: string;
    readonly patterns: readonly string[];
}
/** A color family measured against the manifest's declared vocabulary. */
export interface FamilyCheck {
    readonly family: string;
    readonly allowed: readonly string[];
}
/**
 * Split a class string into its individual utilities.
 *
 * @param {string} raw - A class-name value, however assembled.
 * @returns {readonly string[]} The non-empty utility tokens, in source order.
 */
export declare function splitClassNames(raw: string): readonly string[];
/**
 * Strip variant prefixes, the important marker, and the negative marker.
 *
 * @param {string} token - One class-name utility.
 * @returns {string} The utility itself, free of variant and modifier syntax.
 */
export declare function utilityOf(token: string): string;
/**
 * The color family a utility names, if it names one.
 *
 * @param {string} utility - A class-name utility.
 * @returns {string | null} The family (`blue` in `bg-blue-500`), or null.
 */
export declare function colorFamilyOf(utility: string): string | null;
/**
 * The literal an arbitrary utility spells out, if it is arbitrary at all.
 *
 * @param {string} utility - A class-name utility.
 * @returns {string | null} The bracketed or parenthesized value, else null.
 */
export declare function arbitraryValueOf(utility: string): string | null;
/**
 * Whether an arbitrary utility spells a color literal instead of naming a token.
 *
 * @param {string} utility - A class-name utility.
 * @returns {boolean} True when the arbitrary value is a color literal.
 */
export declare function isArbitraryColor(utility: string): boolean;
/**
 * Whether a configured allowlist pattern claims a subject.
 *
 * A pattern ending in `*` matches by prefix; anything else must match outright.
 *
 * @param {AllowlistClaim} claim - The subject and the configured patterns.
 * @returns {boolean} True when a pattern claims the subject.
 */
export declare function isAllowlisted(claim: AllowlistClaim): boolean;
/**
 * Whether a color family is off-token under the configured vocabulary.
 *
 * @param {FamilyCheck} check - The family and the families the manifest declares.
 * @returns {boolean} True when the family is neither declared nor neutral.
 */
export declare function isOffTokenFamily(check: FamilyCheck): boolean;
/**
 * Every statically visible class string inside an expression.
 *
 * Class names reach a component through three shapes: a JSX attribute, a class
 * helper call (`clsx`/`cn`/`cva`/`twMerge`), or a conditional picking one of
 * them. Walking all three is what stops a rule from being defeated by wrapping
 * the offending utility in an expression.
 *
 * @param {ESTree.Node} node - The expression to read.
 * @returns {readonly ClassString[]} The class strings found, in source order.
 */
export declare function classStringsIn(node: ESTree.Node): readonly ClassString[];
/**
 * Whether a call is one of the helpers whose arguments are class names.
 *
 * @param {ESTree.Node} node - The candidate expression.
 * @returns {boolean} True when the node is a \`clsx\`/\`cn\`/\`cva\`/\`twMerge\` call.
 */
export declare function isClassHelperCall(node: ESTree.Node): node is ESTree.CallExpression;
/** One utility token and the class string it was written in. */
export interface UtilityHit {
    readonly token: string;
    readonly node: ESTree.Node;
}
/** Class strings plus the utility prefixes the configuration keeps legal. */
export interface UtilityScan {
    readonly classes: readonly ClassString[];
    readonly allowTokens: readonly string[];
}
/**
 * Every utility token in a set of class strings that the allowlist does not claim.
 *
 * @param {UtilityScan} scan - The class strings and the allowed utility prefixes.
 * @returns {readonly UtilityHit[]} The surviving tokens, in source order.
 */
export declare function utilitiesIn(scan: UtilityScan): readonly UtilityHit[];
/**
 * The class-name attribute values of a JSX opening element.
 *
 * @param {ESTree.JSXOpeningElement} node - The opening element.
 * @returns {readonly ClassString[]} The class strings its attributes carry.
 */
export declare function classAttributesOf(node: ESTree.JSXOpeningElement): readonly ClassString[];
