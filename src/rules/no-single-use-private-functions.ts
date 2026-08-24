import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { ancestorsOf } from "../shared/ancestors.ts";

import { isString } from "../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

type DeclaredVariable = ReturnType<SourceCode["getDeclaredVariables"]>[number];

type CandidateKind = "effect-function" | "effect-program" | "function" | "type";

interface Candidate {
	kind: CandidateKind;
	name: string;
	node: ESTree.Node;
	variable: DeclaredVariable;
}

const MESSAGE_BY_KIND = {
	"effect-function": "singleUseEffectFunction",
	"effect-program": "singleUseEffectProgram",
	function: "singleUseFunction",
	type: "singleUseType",
} satisfies Readonly<Record<CandidateKind, string>>;

function isPascalCase(name: string): boolean {
	return /^[A-Z]/u.test(name);
}

/** Computed or plain property name on a member expression.
 *
 * @param {ESTree.Node} member - The member expression node.
 * @returns {string | null} The property name, or null when unavailable.
 */
function memberName(member: ESTree.Node): string | null {
	if (member.type !== "MemberExpression") return null;
	if (!member.computed) {
		return member.property.type === "Identifier" ? member.property.name : null;
	}
	if (member.property.type === "Literal" && isString(member.property.value)) {
		return member.property.value;
	}
	return null;
}

/** Whether the call resolves to `Effect.<method>` (one invocation wrapper allowed for `Effect.fn("N")(...)`).
 *
 * @param {{ call: ESTree.Node; method: string }} payload - The candidate call and Effect method name.
 * @returns {boolean} True when the call targets `Effect.<method>`.
 */
function isEffectMethodCall(payload: { call: ESTree.Node; method: string }): boolean {
	let callee: ESTree.Node = payload.call;
	if (callee.type === "CallExpression") callee = callee.callee;
	if (callee.type !== "MemberExpression") return false;
	if (callee.object.type !== "Identifier") return false;
	return callee.object.name === "Effect" && memberName(callee) === payload.method;
}

/**
 * Classify an initializer expression by the kind of private candidate it
 * declares: plain function values, Effect.fn-style services, or Effect.gen
 * programs.
 *
 * @param {ESTree.Node} init - The initializer expression of a top-level declarator.
 * @returns {CandidateKind | null} The candidate kind, or null when not a candidate.
 */
function effectInitializerKind(init: ESTree.Node): CandidateKind | null {
	const kind = init.type;
	if (kind === "ArrowFunctionExpression" || kind === "FunctionExpression") {
		return "function";
	}
	if (kind !== "CallExpression") return null;
	if (
		isEffectMethodCall({ call: init, method: "fn" }) ||
		isEffectMethodCall({ call: init, method: "fnUntraced" })
	) {
		return "effect-function";
	}
	if (isEffectMethodCall({ call: init, method: "gen" })) return "effect-program";
	return null;
}

function addDeclaredName(declaration: ESTree.Node | null, names: Set<string>): void {
	if (declaration === null) return;
	if (
		declaration.type === "FunctionDeclaration" ||
		declaration.type === "TSTypeAliasDeclaration" ||
		declaration.type === "TSInterfaceDeclaration"
	) {
		if (declaration.id != null) names.add(declaration.id.name);
		return;
	}
	if (declaration.type === "VariableDeclaration") {
		for (const declarator of declaration.declarations) {
			if (declarator.id.type === "Identifier") names.add(declarator.id.name);
		}
	}
}

/** Re-exported or default-exported names are public regardless of local privacy.
 *
 * @param {ESTree.Program} program - Root AST node of the file under lint.
 * @returns {Set<string>} Names treated as public exports.
 */
function exportedNames(program: ESTree.Program): Set<string> {
	const names = new Set<string>();
	for (const statement of program.body) {
		if (statement.type === "ExportDefaultDeclaration") {
			addDeclaredName(statement.declaration ?? null, names);
		}
		if (statement.type === "ExportNamedDeclaration") {
			addDeclaredName(statement.declaration ?? null, names);
			if (statement.source === null || statement.source === undefined) {
				for (const specifier of statement.specifiers) {
					if (specifier.local !== undefined && specifier.local.type === "Identifier") {
						names.add(specifier.local.name);
					}
				}
			}
		}
		if (statement.type === "TSExportAssignment") {
			if (statement.expression.type === "Identifier") {
				names.add(statement.expression.name);
			}
		}
	}
	return names;
}

/** Reads inside type positions (`: T`, `as T`, generics) are not runtime reads.
 *
 * @param {SourceCode} sourceCode - The rule's source-code accessor.
 * @param {ESTree.Node} identifier - The identifier reference being counted.
 * @returns {boolean} True when the read sits in a type position.
 */
function hasTypeAncestor(sourceCode: SourceCode, identifier: ESTree.Node): boolean {
	for (const current of ancestorsOf(sourceCode, identifier)) {
		const kind = current.type;
		if (kind.startsWith("TS")) return true;
		if (
			kind === "Program" ||
			kind === "BlockStatement" ||
			kind === "ExpressionStatement"
		) {
			return false;
		}
	}
	return false;
}

/** Reads inside re-export positions do not count toward private usage.
 *
 * @param {SourceCode} sourceCode - The rule's source-code accessor.
 * @param {ESTree.Node} identifier - The identifier reference being counted.
 * @returns {boolean} True when the read sits in an export position.
 */
function hasExportAncestor(sourceCode: SourceCode, identifier: ESTree.Node): boolean {
	for (const current of ancestorsOf(sourceCode, identifier)) {
		const kind = current.type;
		if (
			kind === "ExportDefaultDeclaration" ||
			kind === "ExportSpecifier" ||
			kind === "TSExportAssignment"
		) {
			return true;
		}
		if (kind === "Program" || kind === "BlockStatement") return false;
	}
	return false;
}

/**
 * Runtime reads of a private top-level binding: reads outside type positions
 * and re-export positions.
 *
 * @param {{ sourceCode: SourceCode; variable: DeclaredVariable }} payload - The declared variable to count.
 * @returns {number} Number of qualifying reads.
 */
function runtimeReadCount(payload: { sourceCode: SourceCode; variable: DeclaredVariable }): number {
	return payload.variable.references.filter(
		(reference) =>
			reference.isRead() &&
			!hasTypeAncestor(payload.sourceCode, reference.identifier) &&
			!hasExportAncestor(payload.sourceCode, reference.identifier),
	).length;
}

/**
 * Type-position reads of a private top-level type alias or interface.
 *
 * @param {{ sourceCode: SourceCode; variable: DeclaredVariable }} payload - The declared type to count.
 * @returns {number} Number of qualifying reads.
 */
function typeReadCount(payload: { sourceCode: SourceCode; variable: DeclaredVariable }): number {
	return payload.variable.references.filter(
		(reference) =>
			reference.isRead() &&
			hasTypeAncestor(payload.sourceCode, reference.identifier) &&
			!hasExportAncestor(payload.sourceCode, reference.identifier),
	).length;
}

/**
 * Usage count for a candidate, using the read model appropriate to its kind.
 *
 * @param {{ sourceCode: SourceCode; candidate: Candidate }} payload - The candidate to count.
 * @returns {number} The usage count.
 */
function useCount(payload: { sourceCode: SourceCode; candidate: Candidate }): number {
	return payload.candidate.kind === "type"
		? typeReadCount({ sourceCode: payload.sourceCode, variable: payload.candidate.variable })
		: runtimeReadCount({ sourceCode: payload.sourceCode, variable: payload.candidate.variable });
}

/**
 * The declared-variable record matching a name among a node's declarations.
 *
 * @param {{ sourceCode: SourceCode; node: ESTree.Node; name: string }} payload - Lookup inputs.
 * @returns {DeclaredVariable | undefined} The matching record, if any.
 */
function declaredVariablesOf(payload: {
	sourceCode: SourceCode;
	node: ESTree.Node;
	name: string;
}): DeclaredVariable | undefined {
	return payload.sourceCode.getDeclaredVariables(payload.node).find((variable) => variable.name === payload.name);
}

/** Top-level privates referenced exactly once are dead indirection; inline them at their single site.
 *
 * A leading JSDoc block marks the name as deliberately documented composition,
 * so such statements are exempt from the check.
 */
export const noSingleUsePrivateFunctionsRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Inline private top-level functions, Effect values, and types that are referenced exactly once; single-use indirection hides shape without earning a name.",
		},
		messages: {
			singleUseFunction:
				"Private function `{{name}}` is read exactly once. Inline it at that use site instead of naming an indirection.",
			singleUseEffectFunction:
				"Private Effect function `{{name}}` is run exactly once. Inline the handler at its single use site.",
			singleUseEffectProgram:
				"Private Effect program `{{name}}` is composed into exactly one pipeline. Inline it there instead of naming an indirection.",
			singleUseType:
				"Private type `{{name}}` is referenced exactly once. Inline the annotation at that use site instead of naming it.",
		},
	},
	createOnce(context) {
		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			Program(node) {
				const sourceCode = context.sourceCode;
				const exported = exportedNames(node);
				const documented = new Set<ESTree.Node>();
				for (const statement of node.body) {
					const comments = context.sourceCode.getCommentsBefore(statement);
					const last = comments[comments.length - 1];
					if (last !== undefined && last.type === "Block" && last.value.startsWith("*")) {
						documented.add(statement);
					}
				}
				const candidates: Array<Candidate> = [];
				for (const statement of node.body) {
					if (documented.has(statement)) continue;
					if (statement.type === "FunctionDeclaration") {
						const name = statement.id?.name;
						if (name === undefined || exported.has(name) || isPascalCase(name)) continue;
						const variable = declaredVariablesOf({ sourceCode, node: statement, name });
						if (variable !== undefined) {
							candidates.push({ kind: "function", name, node: statement, variable });
						}
						continue;
					}
					if (statement.type === "TSTypeAliasDeclaration" || statement.type === "TSInterfaceDeclaration") {
						const name = statement.id.name;
						if (exported.has(name)) continue;
						const variable = declaredVariablesOf({ sourceCode, node: statement, name });
						if (variable !== undefined) {
							candidates.push({ kind: "type", name, node: statement, variable });
						}
						continue;
					}
					if (statement.type !== "VariableDeclaration") continue;
					for (const declarator of statement.declarations) {
						if (declarator.id.type !== "Identifier") continue;
						const { name } = declarator.id;
						const init = declarator.init;
						if (init === null || init === undefined) continue;
						const candidateKind = effectInitializerKind(init);
						if (candidateKind === null) continue;
						const chain = ancestorsOf(sourceCode, declarator);
						const parent = chain[0];
						const grandparent = chain[1];
						if (
							parent === undefined ||
							grandparent === undefined ||
							parent.type !== "VariableDeclaration" ||
							grandparent.type !== "Program"
						) {
							continue;
						}
						if (exported.has(name) || isPascalCase(name)) continue;
						const variable = declaredVariablesOf({ sourceCode, node: declarator, name });
						if (variable !== undefined) {
							candidates.push({ kind: candidateKind, name, node: declarator, variable });
						}
					}
				}
				for (const candidate of candidates) {
					if (useCount({ sourceCode, candidate }) !== 1) continue;
					context.report({
						node: candidate.node,
						messageId: MESSAGE_BY_KIND[candidate.kind],
						data: { name: candidate.name },
					});
				}
			},
		};
	},
});
