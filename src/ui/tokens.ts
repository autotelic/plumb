import { isString, readField } from "../shared/structural.ts";

import type { ESTree } from "@oxlint/plugins";

/*
 * Class-name token vocabulary for the `plumb-ui` rules.
 *
 * Everything here is a pure function over a Tailwind class string: the rules own
 * reporting, this module owns the vocabulary. Keeping the split in one place is
 * what lets `no-off-token-color` and `no-arbitrary-value` agree on what a
 * utility, a color family, and an arbitrary value are.
 */

/** Utility prefixes whose remainder names a color token. */
const COLOR_UTILITY_PREFIXES: readonly string[] = [
	"accent",
	"bg",
	"border",
	"caret",
	"decoration",
	"divide",
	"fill",
	"from",
	"outline",
	"placeholder",
	"ring",
	"shadow",
	"stroke",
	"text",
	"via",
];

/** Color families every palette carries; never a finding without configuration. */
const NEUTRAL_COLOR_FAMILIES: ReadonlySet<string> = new Set([
	"black",
	"current",
	"inherit",
	"transparent",
	"white",
]);

/** Tailwind's built-in palette families: legal in the engine, absent from most token manifests. */
export const DEFAULT_OFF_TOKEN_FAMILIES: ReadonlySet<string> = new Set([
	"amber",
	"blue",
	"cyan",
	"emerald",
	"fuchsia",
	"green",
	"indigo",
	"lime",
	"neutral",
	"orange",
	"pink",
	"purple",
	"red",
	"rose",
	"sky",
	"slate",
	"stone",
	"teal",
	"violet",
	"yellow",
	"zinc",
]);

/** Literals an arbitrary value may spell instead of naming a color token. */
const COLOR_LITERAL_PREFIXES: readonly string[] = ["#", "color", "hsl", "hsla", "oklch", "rgb", "rgba"];

/** Depth at which a class-name expression stops being worth walking. */
const MAX_EXPRESSION_DEPTH = 4;

/** Call helpers whose arguments are class names by construction. */
const CLASS_HELPER_NAMES: ReadonlySet<string> = new Set(["cva", "classNames", "clsx", "cn", "twMerge"]);

/** JSX attributes whose value is a class list. */
const CLASS_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set(["class", "className"]);

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
 * Index of the last `:` outside brackets and parentheses, or -1.
 *
 * @param {string} text - The class-name token.
 * @returns {number} The index of the last top-level colon, or -1 when there is none.
 */
function lastTopLevelColon(text: string): number {
	let index = -1;
	let depth = 0;
	for (let position = 0; position < text.length; position += 1) {
		const character = text[position];
		if (character === "[" || character === "(") depth += 1;
		else if (character === "]" || character === ")") depth -= 1;
		else if (character === ":" && depth === 0) index = position;
	}
	return index;
}

/**
 * Split a class string into its individual utilities.
 *
 * @param {string} raw - A class-name value, however assembled.
 * @returns {readonly string[]} The non-empty utility tokens, in source order.
 */
export function splitClassNames(raw: string): readonly string[] {
	return raw.split(/\s+/u).filter((token) => token.length > 0);
}

/**
 * Strip variant prefixes, the important marker, and the negative marker.
 *
 * @param {string} token - One class-name utility.
 * @returns {string} The utility itself, free of variant and modifier syntax.
 */
export function utilityOf(token: string): string {
	const colon = lastTopLevelColon(token);
	let body = colon === -1 ? token : token.slice(colon + 1);
	while (body.startsWith("!") || body.startsWith("-")) body = body.slice(1);
	return body;
}

/**
 * The family segment before the first top-level `-`, opacity slash dropped.
 *
 * @param {string} remainder - A color utility's remainder after its prefix.
 * @returns {string} The family segment, or the whole remainder when it has no separator.
 */
function splitColorFamily(remainder: string): string {
	let depth = 0;
	for (let position = 0; position < remainder.length; position += 1) {
		const character = remainder[position];
		if (character === "[" || character === "(") depth += 1;
		else if (character === "]" || character === ")") depth -= 1;
		else if (depth === 0 && (character === "-" || character === "/")) return remainder.slice(0, position);
	}
	return remainder;
}

/**
 * The color family a utility names, if it names one.
 *
 * @param {string} utility - A class-name utility.
 * @returns {string | null} The family (`blue` in `bg-blue-500`), or null.
 */
export function colorFamilyOf(utility: string): string | null {
	for (const prefix of COLOR_UTILITY_PREFIXES) {
		if (!utility.startsWith(`${prefix}-`)) continue;
		const family = splitColorFamily(utility.slice(prefix.length + 1));
		return family === "" ? null : family;
	}
	return null;
}

/**
 * The content between the first opener and its closing delimiter.
 *
 * @param {BracketQuery} query - The utility and the delimiter pair to read.
 * @returns {string | null} The content, or null when the opener is absent.
 */
function bracketedValue(query: BracketQuery): string | null {
	const start = query.utility.indexOf(query.open);
	if (start === -1) return null;
	const end = query.utility.indexOf(query.close, start + 1);
	return end === -1 ? query.utility.slice(start + 1) : query.utility.slice(start + 1, end);
}

/**
 * The literal an arbitrary utility spells out, if it is arbitrary at all.
 *
 * @param {string} utility - A class-name utility.
 * @returns {string | null} The bracketed or parenthesized value, else null.
 */
export function arbitraryValueOf(utility: string): string | null {
	return (
		bracketedValue({ utility, open: "[", close: "]" }) ??
		bracketedValue({ utility, open: "(", close: ")" })
	);
}

/**
 * Whether an arbitrary utility spells a color literal instead of naming a token.
 *
 * @param {string} utility - A class-name utility.
 * @returns {boolean} True when the arbitrary value is a color literal.
 */
export function isArbitraryColor(utility: string): boolean {
	const value = arbitraryValueOf(utility);
	return value !== null && COLOR_LITERAL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * Whether a configured allowlist pattern claims a subject.
 *
 * A pattern ending in `*` matches by prefix; anything else must match outright.
 *
 * @param {AllowlistClaim} claim - The subject and the configured patterns.
 * @returns {boolean} True when a pattern claims the subject.
 */
export function isAllowlisted(claim: AllowlistClaim): boolean {
	return claim.patterns.some((pattern) =>
		pattern.endsWith("*") ? claim.subject.startsWith(pattern.slice(0, -1)) : claim.subject.startsWith(pattern),
	);
}

/**
 * Whether a color family is off-token under the configured vocabulary.
 *
 * @param {FamilyCheck} check - The family and the families the manifest declares.
 * @returns {boolean} True when the family is neither declared nor neutral.
 */
export function isOffTokenFamily(check: FamilyCheck): boolean {
	if (check.allowed.includes(check.family)) return false;
	return !NEUTRAL_COLOR_FAMILIES.has(check.family);
}

/**
 * One level down the class-string walk.
 *
 * @param {WalkBudget} budget - The child node and the depth it inherits.
 * @returns {readonly ClassString[]} The class strings below that node.
 */
function descend(budget: WalkBudget): readonly ClassString[] {
	return classStringsWithin({ node: budget.node, depth: budget.depth - 1 });
}

/**
 * Every statically visible class string inside a walk budget.
 *
 * @param {WalkBudget} budget - The node to read and the depth budget left.
 * @returns {readonly ClassString[]} The class strings found, in source order.
 */
function classStringsWithin(budget: WalkBudget): readonly ClassString[] {
	if (budget.depth < 0) return [];
	const node = budget.node;
	if (node.type === "Literal") {
		const value = readField(node, "value");
		return isString(value) ? [{ value, node }] : [];
	}
	if (node.type === "TemplateLiteral") {
		return node.quasis.map((quasi) => ({
			value: quasi.value.raw ?? quasi.value.cooked ?? "",
			node: quasi,
		}));
	}
	if (node.type === "ParenthesizedExpression") return descend({ node: node.expression, depth: budget.depth });
	if (node.type === "ConditionalExpression") {
		return [
			...descend({ node: node.consequent, depth: budget.depth }),
			...descend({ node: node.alternate, depth: budget.depth }),
		];
	}
	if (node.type === "LogicalExpression") {
		return [
			...descend({ node: node.left, depth: budget.depth }),
			...descend({ node: node.right, depth: budget.depth }),
		];
	}
	if (node.type === "ArrayExpression") {
		return node.elements.flatMap((element) =>
			element === null ? [] : descend({ node: element, depth: budget.depth }),
		);
	}
	if (node.type === "ObjectExpression") {
		return node.properties.flatMap((property) =>
			descend({ node: property.type === "Property" ? property.value : property.argument, depth: budget.depth }),
		);
	}
	if (isClassHelperCall(node)) {
		return node.arguments.flatMap((argument) => descend({ node: argument, depth: budget.depth }));
	}
	if (node.type === "JSXExpressionContainer") return descend({ node: node.expression, depth: budget.depth });
	return [];
}

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
export function classStringsIn(node: ESTree.Node): readonly ClassString[] {
	return classStringsWithin({ node, depth: MAX_EXPRESSION_DEPTH });
}

/**
 * Whether a call is one of the helpers whose arguments are class names.
 *
 * @param {ESTree.Node} node - The candidate expression.
 * @returns {boolean} True when the node is a \`clsx\`/\`cn\`/\`cva\`/\`twMerge\` call.
 */
export function isClassHelperCall(node: ESTree.Node): node is ESTree.CallExpression {
	return (
		node.type === "CallExpression" &&
		node.callee.type === "Identifier" &&
		CLASS_HELPER_NAMES.has(node.callee.name)
	);
}

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
export function utilitiesIn(scan: UtilityScan): readonly UtilityHit[] {
	const hits: UtilityHit[] = [];
	for (const classString of scan.classes) {
		for (const token of splitClassNames(classString.value)) {
			if (isAllowlisted({ subject: token, patterns: scan.allowTokens })) continue;
			hits.push({ token, node: classString.node });
		}
	}
	return hits;
}

/**
 * The class-name attribute values of a JSX opening element.
 *
 * @param {ESTree.JSXOpeningElement} node - The opening element.
 * @returns {readonly ClassString[]} The class strings its attributes carry.
 */
export function classAttributesOf(node: ESTree.JSXOpeningElement): readonly ClassString[] {
	const found: ClassString[] = [];
	for (const attribute of node.attributes) {
		if (attribute.type !== "JSXAttribute") continue;
		if (attribute.name.type !== "JSXIdentifier" || !CLASS_ATTRIBUTE_NAMES.has(attribute.name.name)) continue;
		const value = attribute.value;
		if (value !== null) found.push(...classStringsIn(value));
	}
	return found;
}
