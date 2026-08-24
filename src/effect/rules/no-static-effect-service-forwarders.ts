import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { ancestorsOf } from "../../shared/ancestors.ts";

import { cast, isString, type NodeFieldValue } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

interface CallbackExpression {
	expression: ESTree.Node;
	parameterName: string | undefined;
}

/** Discriminant reader for engine nodes the typings leave loose.
 *
 * @param {ESTree.Node} node - The engine node to read.
 * @returns {string} The node's `type` discriminant.
 */
function typeOf(node: ESTree.Node): string {
	return cast<{ readonly type: string }>(node).type;
}

/**
 * Property name of a member expression, computed or plain.
 *
 * @param {ESTree.Node} member - The member expression node.
 * @returns {string | null} The property name, or null when unavailable.
 */
function memberName(member: ESTree.Node): string | null {
	const memberView = cast<{
		readonly computed?: boolean;
		readonly property: ESTree.Node;
	}>(member);
	if (memberView.computed === true) {
		const value = cast<{ readonly value?: NodeFieldValue }>(memberView.property).value;
		return value !== undefined && isString(value) ? value : null;
	}
	return typeOf(memberView.property) === "Identifier"
		? cast<{ readonly name: string }>(memberView.property).name
		: null;
}

/**
 * Imported name behind an import specifier, for both plain and string-literal spellings.
 *
 * @param {ESTree.Node} specifier - The import specifier node.
 * @returns {string | undefined} The imported name, if any.
 */
function importedNameOf(specifier: ESTree.Node): string | undefined {
	const imported = cast<{
		readonly imported?: { readonly name?: string; readonly value?: NodeFieldValue };
	}>(specifier).imported;
	if (imported === undefined) return undefined;
	if (imported.name !== undefined) return imported.name;
	const value = imported.value;
	return value !== undefined && isString(value) ? value : undefined;
}

/**
 * Local binding name of an import specifier.
 *
 * @param {ESTree.Node} specifier - The import specifier node.
 * @returns {string | undefined} The local bound name, if any.
 */
function localNameOf(specifier: ESTree.Node): string | undefined {
	return cast<{ readonly local?: { readonly name?: string } }>(specifier).local?.name;
}

/** Whether the call site sits inside a `static` class property initializer.
 *
 * @param {import("@oxlint/plugins").SourceCode} sourceCode - The rule's source-code accessor.
 * @param {ESTree.Node} node - The call expression being visited.
 * @returns {boolean} True when enclosed by a static property definition.
 */
function inStaticClassField(sourceCode: import("@oxlint/plugins").SourceCode, node: ESTree.Node): boolean {
	for (const current of ancestorsOf(sourceCode, node)) {
		const kind = typeOf(current);
		if (kind === "PropertyDefinition") return cast<{ readonly static?: boolean }>(current).static === true;
		if (kind === "Program") return false;
	}
	return false;
}

/**
 * Single-parameter handler whose body is one expression or one return statement.
 *
 * @param {ESTree.Node} node - The candidate callback function node.
 * @returns {CallbackExpression | undefined} The extracted expression and parameter, if matching.
 */
function callbackExpression(node: ESTree.Node): CallbackExpression | undefined {
	const kind = typeOf(node);
	if (kind !== "ArrowFunctionExpression" && kind !== "FunctionExpression") return undefined;
	const params = cast<{ readonly params: ReadonlyArray<ESTree.Node> }>(node).params;
	if (params.length !== 1) return undefined;
	const parameter = params[0]!;
	if (typeOf(parameter) !== "Identifier") return undefined;
	const parameterName = cast<{ readonly name: string }>(parameter).name;
	const body = cast<{ readonly body: ESTree.Node }>(node).body;
	if (typeOf(body) !== "BlockStatement") return { expression: body, parameterName };
	const statements = cast<{ readonly body: ReadonlyArray<ESTree.Node> }>(body).body;
	if (statements.length !== 1) return undefined;
	const statement = statements[0]!;
	if (typeOf(statement) !== "ReturnStatement") return undefined;
	const argument = cast<{ readonly argument?: ESTree.Node | null }>(statement).argument;
	if (argument === null || argument === undefined) return undefined;
	return { expression: argument, parameterName };
}

/** `svc.member(...)` or bare `svc.member`, where `svc` is exactly the acquired service.
 *
 * @param {ESTree.Node} expression - The forwarded callback expression.
 * @param {string | undefined} parameterName - The acquired service parameter name.
 * @returns {boolean} True when the expression only reads that service's member.
 */
function isDirectParameterMember(expression: ESTree.Node, parameterName: string | undefined): boolean {
	if (parameterName === undefined) return false;
	const member =
		typeOf(expression) === "CallExpression"
			? cast<{ readonly callee: ESTree.Node }>(expression).callee
			: expression;
	if (typeOf(member) !== "MemberExpression") return false;
	const object = cast<{ readonly object: ESTree.Node }>(member).object;
	return typeOf(object) === "Identifier" && cast<{ readonly name: string }>(object).name === parameterName;
}

/** Static forwarders alias a service method at module scope; acquire the service where its method is used instead.
 *
 * Import tracking covers local names bound by imports of "effect" and
 * "effect/Effect"; re-exports are not tracked.
 */
export const noStaticEffectServiceForwardersRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow static class-field forwarders around Effect services; yield the service at the usage site and call the method directly so dependencies stay explicit.",
		},
		messages: {
			staticForwarder:
				"This static field forwards an Effect service method. Acquire the service where the method is used (`Effect.flatMap(Service, (svc) => ...)`) so the dependency stays explicit and testable.",
		},
	},
	createOnce(context) {
		const effectNamespaceNames = new Set<string>();
		const flatMapNames = new Set<string>();
		const serviceNames = new Set<string>();
		const pipeNames = new Set<string>();

		const isEffectCall = (
			node: ESTree.Node,
			method: string,
			directNames: ReadonlySet<string>,
		): boolean => {
			if (typeOf(node) !== "CallExpression") return false;
			const callee = cast<{ readonly callee: ESTree.Node }>(node).callee;
			if (typeOf(callee) === "Identifier") {
				return directNames.has(cast<{ readonly name: string }>(callee).name);
			}
			if (typeOf(callee) !== "MemberExpression") return false;
			const object = cast<{ readonly object: ESTree.Node }>(callee).object;
			return (
				typeOf(object) === "Identifier" &&
				effectNamespaceNames.has(cast<{ readonly name: string }>(object).name) &&
				memberName(callee) === method
			);
		};

		const isServiceAcquisition = (node: ESTree.Node): boolean => {
			if (!isEffectCall(node, "service", serviceNames)) return false;
			const args = cast<{ readonly arguments: ReadonlyArray<ESTree.Node> }>(node).arguments;
			return args.length === 1 && typeOf(args[0]!) === "ThisExpression";
		};

		const isForwardingFlatMap = (node: ESTree.Node): boolean => {
			if (!isEffectCall(node, "flatMap", flatMapNames)) return false;
			const args = cast<{ readonly arguments: ReadonlyArray<ESTree.Node> }>(node).arguments;
			const last = args[args.length - 1];
			if (last === undefined) return false;
			const callback = callbackExpression(last);
			if (callback === undefined) return false;
			return isDirectParameterMember(callback.expression, callback.parameterName);
		};

		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			ImportDeclaration(node) {
				const sourceValue = cast<{
					readonly source?: { readonly value?: unknown };
				}>(node).source?.value;
				const specifiers = cast<{
					readonly specifiers: ReadonlyArray<ESTree.Node>;
				}>(node).specifiers;
				if (sourceValue === "effect") {
					for (const specifier of specifiers) {
						const local = localNameOf(specifier);
						if (local === undefined) continue;
						const kind = typeOf(specifier);
						if (kind === "ImportNamespaceSpecifier") effectNamespaceNames.add(local);
						const imported = importedNameOf(specifier);
						if (kind === "ImportSpecifier" && imported === "Effect") {
							effectNamespaceNames.add(local);
						}
						if (kind === "ImportSpecifier" && imported === "pipe") pipeNames.add(local);
					}
					return;
				}
				if (sourceValue !== "effect/Effect") return;
				for (const specifier of specifiers) {
					const local = localNameOf(specifier);
					if (local === undefined) continue;
					const kind = typeOf(specifier);
					if (kind === "ImportNamespaceSpecifier" || kind === "ImportDefaultSpecifier") {
						effectNamespaceNames.add(local);
						continue;
					}
					const imported = importedNameOf(specifier);
					if (imported === "flatMap") flatMapNames.add(local);
					else if (imported === "service") serviceNames.add(local);
				}
			},
			CallExpression(node) {
				if (!inStaticClassField(context.sourceCode, node)) return;
				const args = node.arguments;
				if (isEffectCall(node, "flatMap", flatMapNames) && args.length >= 2) {
					const first = args[0];
					if (first !== undefined && isServiceAcquisition(first) && isForwardingFlatMap(node)) {
						context.report({ node, messageId: "staticForwarder" });
						return;
					}
				}
				const callee = node.callee;
				let subject: ESTree.Node | undefined;
				let operators: ReadonlyArray<ESTree.Node>;
				if (callee.type === "Identifier") {
					if (!pipeNames.has(callee.name)) return;
					subject = args[0];
					operators = args.slice(1);
				} else {
					if (callee.type !== "MemberExpression" || memberName(callee) !== "pipe") {
						return;
					}
					subject = callee.object;
					operators = args;
				}
				if (
					subject !== undefined &&
					isServiceAcquisition(subject) &&
					operators.some((operator) => isForwardingFlatMap(operator))
				) {
					context.report({ node, messageId: "staticForwarder" });
				}
			},
		};
	},
});
