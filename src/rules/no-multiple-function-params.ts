import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { cast, readField } from "../shared/structural.ts";

import { ancestorsOf } from "../shared/ancestors.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

const DEFAULT_MAX_PARAMS = 1;

/** Conventional HTTP method handler names, exempt inside framework route files. */
const HTTP_METHOD_NAMES = new Set([
	"DELETE",
	"GET",
	"HEAD",
	"OPTIONS",
	"PATCH",
	"POST",
	"PUT",
]);

const DEFAULT_ROUTE_BASENAMES = new Set(["route.ts", "route.tsx"]);

interface Options {
	readonly exemptFunctionNames?: ReadonlyArray<string>;
	readonly exemptRouteBasenames?: ReadonlyArray<string>;
}

/** Structural view of a function-like visitor node. */
interface FunctionLike {
	readonly params: ReadonlyArray<ESTree.ParamPattern>;
}

/** Discriminant reader for engine nodes the typings leave loose. */
function typeOf(node: object): string {
	return cast<{ readonly type: string }>(node).type;
}

function basename(filename: string): string {
	const normalized = filename.replaceAll("\\", "/");
	const segments = normalized.split("/");
	return segments[segments.length - 1] ?? normalized;
}

function parentOf(sourceCode: SourceCode, node: ESTree.Node): object | null {
	return ancestorsOf(sourceCode, node)[0] ?? null;
}

/** Functions the module owns: declarations and named bindings, not callbacks. */
function isOwnedFunction(sourceCode: SourceCode, node: ESTree.Node): boolean {
	if (typeOf(node) === "FunctionDeclaration") return true;
	const parent = parentOf(sourceCode, node);
	if (parent === null) return false;
	const parentType = typeOf(parent);
	if (
		parentType === "CallExpression" ||
		parentType === "NewExpression" ||
		parentType === "JSXExpressionContainer"
	) {
		return false;
	}
	return (
		parentType === "VariableDeclarator" ||
		parentType === "AssignmentExpression" ||
		parentType === "ExportDefaultDeclaration"
	);
}

interface ResolvedOptions {
	methodNames: ReadonlySet<string>;
	routeBasenames: ReadonlySet<string>;
}

/** Exported HTTP-method-named handlers in framework route files own their arity. */
function isExemptRouteHandler(
	options: ResolvedOptions,
	filename: string,
	sourceCode: SourceCode,
	node: ESTree.Node,
): boolean {
	if (typeOf(node) !== "FunctionDeclaration") return false;
	const name = cast<{ readonly id?: { readonly name: string } | null }>(node).id?.name;
	if (name === undefined || !options.methodNames.has(name)) return false;
	if (!options.routeBasenames.has(basename(filename))) return false;
	const parent = parentOf(sourceCode, node);
	return parent !== null && typeOf(parent) === "ExportNamedDeclaration";
}

function displayName(sourceCode: SourceCode, node: ESTree.Node): string {
	const declared = cast<{ readonly id?: { readonly name: string } | null }>(node).id;
	if (declared != null) return declared.name;
	const parent = parentOf(sourceCode, node);
	if (parent !== null && typeOf(parent) === "VariableDeclarator") {
		const id = cast<{ readonly id?: { readonly name?: string } }>(parent).id;
		if (id?.name !== undefined) return id.name;
	}
	if (parent !== null && typeOf(parent) === "AssignmentExpression") {
		const left = cast<{ readonly left?: { readonly name?: string } }>(parent).left;
		if (left?.name !== undefined) return left.name;
	}
	return "(anonymous)";
}

/** Owned functions taking several positional inputs accept transposed arguments silently; require one payload object. */
export const noMultipleFunctionParamsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow owned functions with more than one positional parameter; collapse multiple inputs into a single named payload object so transposed arguments fail the compiler.",
		},
		messages: {
			multipleParams:
				"`{{name}}` takes {{count}} positional parameters. Accept a single named payload object instead; transposed primitive arguments compile silently.",
		},
	},
	createOnce(context) {
		const rawOptions = readField<ReadonlyArray<Options>>(context, "options");
		const options: ResolvedOptions = {
			methodNames: new Set(rawOptions?.[0]?.exemptFunctionNames ?? HTTP_METHOD_NAMES),
			routeBasenames: new Set(
				rawOptions?.[0]?.exemptRouteBasenames ?? DEFAULT_ROUTE_BASENAMES,
			),
		};
		const filename = context.filename;
		const check = (node: ESTree.Node): void => {
			const fn = cast<FunctionLike>(node);
			if (fn.params.length <= DEFAULT_MAX_PARAMS) return;
			if (!isOwnedFunction(context.sourceCode, node)) return;
			if (isExemptRouteHandler(options, filename, context.sourceCode, node)) return;
			context.report({
				node,
				messageId: "multipleParams",
				data: {
					name: displayName(context.sourceCode, node),
					count: String(fn.params.length),
				},
			});
		};
		return {
			before() {
				if (TEST_FILE.test(filename.replaceAll("\\", "/"))) return false;
			},
			FunctionDeclaration: check,
			FunctionExpression: check,
			ArrowFunctionExpression: check,
		};
	},
});
