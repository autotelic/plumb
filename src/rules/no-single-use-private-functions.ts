import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { ancestorsOf } from "../shared/ancestors.ts";

import { cast, isString, type NodeFieldValue } from "../shared/structural.ts";

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

/** Discriminant reader for engine nodes the typings leave loose.
 *
 * @param {ESTree.Node} node - The engine node to read.
 * @returns {string} The node's `type` discriminant.
 */
function typeOf(node: ESTree.Node): string {
	return cast<{ readonly type: string }>(node).type;
}

function isPascalCase(name: string): boolean {
	return /^[A-Z]/u.test(name);
}

/** Computed or plain property name on a member expression.
 *
 * @param {ESTree.Node} member - The member expression node.
 * @returns {string | null} The property name, or null when unavailable.
 */
function memberName(member: ESTree.Node): string | null {
	const memberView = cast<{
		readonly computed?: boolean;
		readonly property: ESTree.Node;
	}>(member);
	if (memberView.computed !== true) {
		const property = memberView.property;
		return typeOf(property) === "Identifier"
			? cast<{ readonly name: string }>(property).name
			: null;
	}
	const literal = cast<{ readonly value?: NodeFieldValue }>(memberView.property).value;
	return literal !== undefined && isString(literal) ? literal : null;
}

/** Whether the call resolves to `Effect.<method>` (one invocation wrapper allowed for `Effect.fn("N")(...)`).
 *
 * @param {{ call: ESTree.Node; method: string }} payload - The candidate call and Effect method name.
 * @returns {boolean} True when the call targets `Effect.<method>`.
 */
function isEffectMethodCall(payload: { call: ESTree.Node; method: string }): boolean {
	let callee: ESTree.Node = cast<{ readonly callee: ESTree.Node }>(payload.call).callee;
	if (typeOf(callee) === "CallExpression") {
		callee = cast<{ readonly callee: ESTree.Node }>(callee).callee;
	}
	if (typeOf(callee) !== "MemberExpression") return false;
	const object = cast<{ readonly object: ESTree.Node }>(callee).object;
	return (
		typeOf(object) === "Identifier" &&
		cast<{ readonly name: string }>(object).name === "Effect" &&
		memberName(callee) === payload.method
	);
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
	const kind = typeOf(init);
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
	const kind = typeOf(declaration);
	if (
		kind === "FunctionDeclaration" ||
		kind === "TSTypeAliasDeclaration" ||
		kind === "TSInterfaceDeclaration"
	) {
		const id = cast<{ readonly id?: { readonly name: string } | null }>(declaration).id;
		if (id != null) names.add(id.name);
		return;
	}
	if (kind === "VariableDeclaration") {
		const declarations = cast<{
			readonly declarations: ReadonlyArray<ESTree.Node>;
		}>(declaration).declarations;
		for (const declarator of declarations) {
			const id = cast<{ readonly id?: { readonly name?: string } }>(declarator).id;
			if (id?.name !== undefined) names.add(id.name);
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
		const kind = typeOf(statement);
		if (kind === "ExportDefaultDeclaration") {
			addDeclaredName(
				cast<{ readonly declaration?: ESTree.Node | null }>(statement).declaration ?? null,
				names,
			);
		}
		if (kind === "ExportNamedDeclaration") {
			const exportView = cast<{
				readonly declaration?: ESTree.Node | null;
				readonly source?: ESTree.Node | null;
				readonly specifiers: ReadonlyArray<ESTree.Node>;
			}>(statement);
			addDeclaredName(exportView.declaration ?? null, names);
			if (exportView.source === null || exportView.source === undefined) {
				for (const specifier of exportView.specifiers) {
					const local = cast<{
						readonly local?: { readonly type: string; readonly name?: string; readonly value?: NodeFieldValue };
					}>(specifier).local;
					if (local?.name !== undefined) names.add(local.name);
				}
			}
		}
		if (kind === "TSExportAssignment") {
			const expression = cast<{ readonly expression: ESTree.Node }>(statement).expression;
			if (typeOf(expression) === "Identifier") {
				names.add(cast<{ readonly name: string }>(expression).name);
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
		const kind = typeOf(current);
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
		const kind = typeOf(current);
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
					const kind = typeOf(statement);
					if (documented.has(statement)) continue;
					if (kind === "FunctionDeclaration") {
						const name = cast<{
							readonly id?: { readonly name: string } | null;
						}>(statement).id?.name;
						if (name === undefined || exported.has(name) || isPascalCase(name)) continue;
						const variable = declaredVariablesOf({ sourceCode, node: statement, name });
						if (variable !== undefined) {
							candidates.push({ kind: "function", name, node: statement, variable });
						}
						continue;
					}
					if (kind === "TSTypeAliasDeclaration" || kind === "TSInterfaceDeclaration") {
						const name = cast<{ readonly id: { readonly name: string } }>(statement).id.name;
						if (exported.has(name)) continue;
						const variable = declaredVariablesOf({ sourceCode, node: statement, name });
						if (variable !== undefined) {
							candidates.push({ kind: "type", name, node: statement, variable });
						}
						continue;
					}
					if (kind !== "VariableDeclaration") continue;
					const declarations = cast<{
						readonly declarations: ReadonlyArray<ESTree.Node>;
					}>(statement).declarations;
					for (const declarator of declarations) {
						const declaratorView = cast<{
							readonly id?: { readonly type: string; readonly name?: string };
							readonly init?: ESTree.Node | null;
						}>(declarator);
						if (declaratorView.id?.type !== "Identifier" || declaratorView.id.name === undefined)
							continue;
						if (declaratorView.init === null || declaratorView.init === undefined) continue;
						const candidateKind = effectInitializerKind(declaratorView.init);
						if (candidateKind === null) continue;
						const chain = ancestorsOf(sourceCode, declarator);
						const parent = chain[0];
						const grandparent = chain[1];
						if (
							parent === undefined ||
							grandparent === undefined ||
							typeOf(parent) !== "VariableDeclaration" ||
							typeOf(grandparent) !== "Program"
						) {
							continue;
						}
						const name = declaratorView.id.name;
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
