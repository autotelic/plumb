import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { ancestorsOf } from "../shared/ancestors.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

type DeclaredVariable = ReturnType<SourceCode["getDeclaredVariables"]>[number];

type CandidateKind = "effect-function" | "effect-program" | "function" | "type";

interface Candidate {
	kind: CandidateKind;
	name: string;
	node: ESTree.Node;
	variable: DeclaredVariable;
}

function isPascalCase(name: string): boolean {
	return /^[A-Z]/u.test(name);
}

/** Computed or plain property name on a member expression. */
function memberName(member: ESTree.MemberExpression): string | null {
	if (!member.computed) {
		return member.property.type === "Identifier" ? member.property.name : null;
	}
	return member.property.type === "Literal" && typeof member.property.value === "string"
		? member.property.value
		: null;
}

/** Whether the call resolves to `Effect.<method>` (one invocation wrapper allowed for `Effect.fn("N")(...)`). */
function isEffectMethodCall(call: ESTree.CallExpression, method: string): boolean {
	let callee: ESTree.Expression | ESTree.Super = call.callee;
	if (callee.type === "CallExpression") callee = callee.callee;
	if (callee.type !== "MemberExpression") return false;
	const object = callee.object;
	return (
		object.type === "Identifier" &&
		object.name === "Effect" &&
		memberName(callee) === method
	);
}

function initializerKind(init: ESTree.Expression | null | undefined): CandidateKind | null {
	if (init === null || init === undefined) return null;
	if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
		return "function";
	}
	if (init.type !== "CallExpression") return null;
	if (isEffectMethodCall(init, "fn") || isEffectMethodCall(init, "fnUntraced")) {
		return "effect-function";
	}
	if (isEffectMethodCall(init, "gen")) return "effect-program";
	return null;
}

function addDeclaredName(declaration: ESTree.Node | null, names: Set<string>): void {
	if (declaration === null) return;
	if (
		declaration.type === "FunctionDeclaration" ||
		declaration.type === "TSTypeAliasDeclaration" ||
		declaration.type === "TSInterfaceDeclaration"
	) {
		if (declaration.id !== null && declaration.id !== undefined) names.add(declaration.id.name);
		return;
	}
	if (declaration.type === "VariableDeclaration") {
		for (const declarator of declaration.declarations) {
			if (declarator.id.type === "Identifier") names.add(declarator.id.name);
		}
	}
}

function exportedNames(program: ESTree.Program): Set<string> {
	const names = new Set<string>();
	for (const statement of program.body) {
		if (statement.type === "ExportDefaultDeclaration") {
			addDeclaredName(
				statement.declaration.type === "FunctionDeclaration" ||
					statement.declaration.type === "VariableDeclaration" ||
					statement.declaration.type === "TSTypeAliasDeclaration" ||
					statement.declaration.type === "TSInterfaceDeclaration"
					? statement.declaration
					: null,
				names,
			);
		}
		if (statement.type === "ExportNamedDeclaration") {
			addDeclaredName(statement.declaration, names);
			if (statement.source === null || statement.source === undefined) {
				for (const specifier of statement.specifiers) {
					names.add(specifier.local.name);
				}
			}
		}
		if (statement.type === "TSExportAssignment" && statement.expression.type === "Identifier") {
			names.add(statement.expression.name);
		}
	}
	return names;
}

/** Reads inside type positions (`: T`, `as T`, generics) are not runtime reads. */
function hasTypeAncestor(sourceCode: SourceCode, identifier: ESTree.Identifier): boolean {
	for (const current of ancestorsOf(sourceCode, identifier)) {
		if (current.type.startsWith("TS")) return true;
		if (
			current.type === "Program" ||
			current.type === "BlockStatement" ||
			current.type === "ExpressionStatement"
		) {
			return false;
		}
	}
	return false;
}

/** Reads inside `export ...` positions re-export the name; they do not count toward private usage. */
function hasExportAncestor(sourceCode: SourceCode, identifier: ESTree.Identifier): boolean {
	for (const current of ancestorsOf(sourceCode, identifier)) {
		if (
			current.type === "ExportDefaultDeclaration" ||
			current.type === "ExportSpecifier" ||
			current.type === "TSExportAssignment"
		) {
			return true;
		}
		if (current.type === "Program" || current.type === "BlockStatement") return false;
	}
	return false;
}

function runtimeReadCount(
	sourceCode: SourceCode,
	variable: DeclaredVariable,
): number {
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
				const candidates: Array<Candidate> = [];
				for (const statement of node.body) {
					if (statement.type === "FunctionDeclaration") {
						const name = statement.id?.name;
						if (name === undefined || exported.has(name) || isPascalCase(name)) continue;
						const variable = declaredVariablesOf(sourceCode, statement, name);
						if (variable !== undefined) {
							candidates.push({ kind: "function", name, node: statement, variable });
						}
						continue;
					}
					if (
						statement.type === "TSTypeAliasDeclaration" ||
						statement.type === "TSInterfaceDeclaration"
					) {
						const name = statement.id.name;
						if (exported.has(name)) continue;
						const variable = declaredVariablesOf(sourceCode, statement, name);
						if (variable !== undefined) {
							candidates.push({ kind: "type", name, node: statement, variable });
						}
						continue;
					}
					if (statement.type !== "VariableDeclaration") continue;
					for (const declarator of statement.declarations) {
						if (declarator.id.type !== "Identifier") continue;
						const kind = initializerKind(declarator.init);
						if (kind === null) continue;
						const chain = ancestorsOf(sourceCode, declarator);
						const parent = chain[0];
						const grandparent = chain[1];
						if (
							parent?.type !== "VariableDeclaration" ||
							grandparent?.type !== "Program"
						) {
							continue;
						}
						const name = declarator.id.name;
						if (exported.has(name) || isPascalCase(name)) continue;
						const variable = declaredVariablesOf(sourceCode, declarator, name);
						if (variable !== undefined) {
							candidates.push({ kind, name, node: declarator, variable });
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

const MESSAGE_BY_KIND: Readonly<Record<CandidateKind, string>> = {
	"effect-function": "singleUseEffectFunction",
	"effect-program": "singleUseEffectProgram",
	function: "singleUseFunction",
	type: "singleUseType",
};
