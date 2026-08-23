import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { ancestorsOf } from "../shared/ancestors.ts";

import { cast } from "../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

type DeclaredVariable = ReturnType<SourceCode["getDeclaredVariables"]>[number];

type CandidateKind = "effect-function" | "effect-program" | "function" | "type";

interface Candidate {
	kind: CandidateKind;
	name: string;
	node: ESTree.Node;
	variable: DeclaredVariable;
}

const MESSAGE_BY_KIND: Readonly<Record<CandidateKind, string>> = {
	"effect-function": "singleUseEffectFunction",
	"effect-program": "singleUseEffectProgram",
	function: "singleUseFunction",
	type: "singleUseType",
};

/** Discriminant reader for engine nodes the typings leave loose. */
function typeOf(node: object): string {
	return cast<{ readonly type: string }>(node).type;
}

function isPascalCase(name: string): boolean {
	return /^[A-Z]/u.test(name);
}

/** Computed or plain property name on a member expression. */
function memberName(member: object): string | null {
	const shape = cast<{
		readonly computed?: boolean;
		readonly property: object;
	}>(member);
	if (shape.computed !== true) {
		const property = shape.property;
		return typeOf(property) === "Identifier"
			? cast<{ readonly name: string }>(property).name
			: null;
	}
	const literal = cast<{ readonly value?: unknown }>(shape.property).value;
	return typeof literal === "string" ? literal : null;
}

/** Whether the call resolves to `Effect.<method>` (one invocation wrapper allowed for `Effect.fn("N")(...)`). */
function isEffectMethodCall(call: object, method: string): boolean {
	let callee: object = cast<{ readonly callee: object }>(call).callee;
	if (typeOf(callee) === "CallExpression") {
		callee = cast<{ readonly callee: object }>(callee).callee;
	}
	if (typeOf(callee) !== "MemberExpression") return false;
	const object = cast<{ readonly object: object }>(callee).object;
	return (
		typeOf(object) === "Identifier" &&
		cast<{ readonly name: string }>(object).name === "Effect" &&
		memberName(callee) === method
	);
}

function initializerKind(init: object | null | undefined): CandidateKind | null {
	if (init === null || init === undefined) return null;
	const kind = typeOf(init);
	if (kind === "ArrowFunctionExpression" || kind === "FunctionExpression") {
		return "function";
	}
	if (kind !== "CallExpression") return null;
	if (isEffectMethodCall(init, "fn") || isEffectMethodCall(init, "fnUntraced")) {
		return "effect-function";
	}
	if (isEffectMethodCall(init, "gen")) return "effect-program";
	return null;
}

function addDeclaredName(declaration: object | null, names: Set<string>): void {
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
			readonly declarations: ReadonlyArray<object>;
		}>(declaration).declarations;
		for (const declarator of declarations) {
			const id = cast<{ readonly id?: { readonly name?: string } }>(declarator).id;
			if (id?.name !== undefined) names.add(id.name);
		}
	}
}

/** Re-exported or default-exported names are public regardless of local privacy. */
function exportedNames(program: ESTree.Program): Set<string> {
	const names = new Set<string>();
	for (const statement of program.body) {
		const kind = typeOf(statement);
		if (kind === "ExportDefaultDeclaration") {
			addDeclaredName(
				cast<{ readonly declaration?: object | null }>(statement).declaration ?? null,
				names,
			);
		}
		if (kind === "ExportNamedDeclaration") {
			const shape = cast<{
				readonly declaration?: object | null;
				readonly source?: object | null;
				readonly specifiers: ReadonlyArray<object>;
			}>(statement);
			addDeclaredName(shape.declaration ?? null, names);
			if (shape.source === null || shape.source === undefined) {
				for (const specifier of shape.specifiers) {
					const local = cast<{
						readonly local?: { readonly type: string; readonly name?: string; readonly value?: unknown };
					}>(specifier).local;
					if (local?.name !== undefined) names.add(local.name);
				}
			}
		}
		if (kind === "TSExportAssignment") {
			const expression = cast<{ readonly expression: object }>(statement).expression;
			if (typeOf(expression) === "Identifier") {
				names.add(cast<{ readonly name: string }>(expression).name);
			}
		}
	}
	return names;
}

/** Reads inside type positions (`: T`, `as T`, generics) are not runtime reads. */
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

/** Reads inside re-export positions do not count toward private usage. */
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

function runtimeReadCount(sourceCode: SourceCode, variable: DeclaredVariable): number {
	return variable.references.filter(
		(reference) =>
			reference.isRead() &&
			!hasTypeAncestor(sourceCode, reference.identifier) &&
			!hasExportAncestor(sourceCode, reference.identifier),
	).length;
}

function typeReadCount(sourceCode: SourceCode, variable: DeclaredVariable): number {
	return variable.references.filter(
		(reference) =>
			reference.isRead() &&
			hasTypeAncestor(sourceCode, reference.identifier) &&
			!hasExportAncestor(sourceCode, reference.identifier),
	).length;
}

function useCount(sourceCode: SourceCode, candidate: Candidate): number {
	return candidate.kind === "type"
		? typeReadCount(sourceCode, candidate.variable)
		: runtimeReadCount(sourceCode, candidate.variable);
}

function declaredVariablesOf(
	sourceCode: SourceCode,
	node: ESTree.Node,
	name: string,
): DeclaredVariable | undefined {
	return sourceCode.getDeclaredVariables(node).find((variable) => variable.name === name);
}

/** Top-level privates referenced exactly once are dead indirection; inline them at their single site. */
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
				// A leading JSDoc block means the name was deliberately documented:
				// named intent at a single site is composition, not indirection.
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
						const variable = declaredVariablesOf(sourceCode, statement, name);
						if (variable !== undefined) {
							candidates.push({ kind: "function", name, node: statement, variable });
						}
						continue;
					}
					if (documented.has(statement)) continue;
				if (kind === "TSTypeAliasDeclaration" || kind === "TSInterfaceDeclaration") {
						const name = cast<{ readonly id: { readonly name: string } }>(statement).id.name;
						if (exported.has(name)) continue;
						const variable = declaredVariablesOf(sourceCode, statement, name);
						if (variable !== undefined) {
							candidates.push({ kind: "type", name, node: statement, variable });
						}
						continue;
					}
					if (kind !== "VariableDeclaration") continue;
					const declarations = cast<{
						readonly declarations: ReadonlyArray<object>;
					}>(statement).declarations;
					for (const declarator of declarations) {
						const shape = cast<{
							readonly id?: { readonly type: string; readonly name?: string };
							readonly init?: object | null;
						}>(declarator);
						if (shape.id?.type !== "Identifier" || shape.id.name === undefined) continue;
						const candidateKind = initializerKind(shape.init);
						if (candidateKind === null) continue;
						const chain = ancestorsOf(sourceCode, cast<ESTree.Node>(declarator));
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
						const name = shape.id.name;
						if (exported.has(name) || isPascalCase(name)) continue;
						const variable = declaredVariablesOf(
							sourceCode,
							cast<ESTree.Node>(declarator),
							name,
						);
						if (variable !== undefined) {
							candidates.push({ kind: candidateKind, name, node: cast<ESTree.Node>(declarator), variable });
						}
					}
				}
				for (const candidate of candidates) {
					if (useCount(sourceCode, candidate) !== 1) continue;
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
