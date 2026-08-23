import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { ancestorsOf } from "../../shared/ancestors.ts";

import { cast } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

interface CallbackExpression {
	expression: object;
	parameterName: string | undefined;
}

/** Discriminant reader for engine nodes the typings leave loose. */
function typeOf(node: object): string {
	return cast<{ readonly type: string }>(node).type;
}

function memberName(member: object): string | null {
	const shape = cast<{
		readonly computed?: boolean;
		readonly property: object;
	}>(member);
	if (shape.computed === true) {
		const value = cast<{ readonly value?: unknown }>(shape.property).value;
		return typeof value === "string" ? value : null;
	}
	return typeOf(shape.property) === "Identifier"
		? cast<{ readonly name: string }>(shape.property).name
		: null;
}

/** Imported name behind an import specifier, for both plain and string-literal spellings. */
function importedNameOf(specifier: object): string | undefined {
	const imported = cast<{
		readonly imported?: { readonly type: string; readonly name?: string; readonly value?: unknown };
	}>(specifier).imported;
	if (imported === undefined) return undefined;
	return imported.name ?? (typeof imported.value === "string" ? imported.value : undefined);
}

function localNameOf(specifier: object): string | undefined {
	return cast<{ readonly local?: { readonly name?: string } }>(specifier).local?.name;
}

/** Whether the call site sits inside a `static` class property initializer. */
function inStaticClassField(sourceCode: import("@oxlint/plugins").SourceCode, node: ESTree.Node): boolean {
	for (const current of ancestorsOf(sourceCode, node)) {
		const kind = typeOf(current);
		if (kind === "PropertyDefinition") return cast<{ readonly static?: boolean }>(current).static === true;
		if (kind === "Program") return false;
	}
	return false;
}

/** Single-parameter handler whose body is one expression or one return statement. */
function callbackExpression(node: object): CallbackExpression | undefined {
	const kind = typeOf(node);
	if (kind !== "ArrowFunctionExpression" && kind !== "FunctionExpression") return undefined;
	const params = cast<{ readonly params: ReadonlyArray<object> }>(node).params;
	if (params.length !== 1) return undefined;
	const parameter = params[0]!;
	if (typeOf(parameter) !== "Identifier") return undefined;
	const parameterName = cast<{ readonly name: string }>(parameter).name;
	const body = cast<{ readonly body: object }>(node).body;
	if (typeOf(body) !== "BlockStatement") return { expression: body, parameterName };
	const statements = cast<{ readonly body: ReadonlyArray<object> }>(body).body;
	if (statements.length !== 1) return undefined;
	const statement = statements[0]!;
	if (typeOf(statement) !== "ReturnStatement") return undefined;
	const argument = cast<{ readonly argument?: object | null }>(statement).argument;
	if (argument === null || argument === undefined) return undefined;
	return { expression: argument, parameterName };
}

/** `svc.member(...)` or bare `svc.member`, where `svc` is exactly the acquired service. */
function isDirectParameterMember(expression: object, parameterName: string | undefined): boolean {
	if (parameterName === undefined) return false;
	const member =
		typeOf(expression) === "CallExpression"
			? cast<{ readonly callee: object }>(expression).callee
			: expression;
	if (typeOf(member) !== "MemberExpression") return false;
	const object = cast<{ readonly object: object }>(member).object;
	return typeOf(object) === "Identifier" && cast<{ readonly name: string }>(object).name === parameterName;
}

/** Static forwarders alias a service method at module scope; acquire the service where its method is used instead. */
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
		// Local names bound by imports of "effect" and "effect/Effect"; re-exports are not tracked.
		const effectNamespaceNames = new Set<string>();
		const flatMapNames = new Set<string>();
		const serviceNames = new Set<string>();
		const pipeNames = new Set<string>();

		const isEffectCall = (
			node: object,
			method: string,
			directNames: ReadonlySet<string>,
		): boolean => {
			if (typeOf(node) !== "CallExpression") return false;
			const callee = cast<{ readonly callee: object }>(node).callee;
			if (typeOf(callee) === "Identifier") {
				return directNames.has(cast<{ readonly name: string }>(callee).name);
			}
			if (typeOf(callee) !== "MemberExpression") return false;
			const object = cast<{ readonly object: object }>(callee).object;
			return (
				typeOf(object) === "Identifier" &&
				effectNamespaceNames.has(cast<{ readonly name: string }>(object).name) &&
				memberName(callee) === method
			);
		};

		const isServiceAcquisition = (node: object): boolean => {
			if (!isEffectCall(node, "service", serviceNames)) return false;
			const args = cast<{ readonly arguments: ReadonlyArray<object> }>(node).arguments;
			return args.length === 1 && typeOf(args[0] ?? {}) === "ThisExpression";
		};

		const isForwardingFlatMap = (node: object): boolean => {
			if (!isEffectCall(node, "flatMap", flatMapNames)) return false;
			const args = cast<{ readonly arguments: ReadonlyArray<object> }>(node).arguments;
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
					readonly specifiers: ReadonlyArray<object>;
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
					const first = args[0] as object;
					if (isServiceAcquisition(first) && isForwardingFlatMap(node as object)) {
						context.report({ node, messageId: "staticForwarder" });
						return;
					}
				}
				const callee = node.callee;
				let subject: object | undefined;
				let operators: ReadonlyArray<object>;
				if (typeOf(callee) === "Identifier") {
					if (!pipeNames.has(cast<{ readonly name: string }>(callee).name)) return;
					subject = args[0] as object | undefined;
					operators = (args as ReadonlyArray<object>).slice(1);
				} else {
					if (
						typeOf(callee) !== "MemberExpression" ||
						memberName(callee as object) !== "pipe"
					) {
						return;
					}
					subject = cast<{ readonly object: object }>(callee).object;
					operators = args as ReadonlyArray<object>;
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
