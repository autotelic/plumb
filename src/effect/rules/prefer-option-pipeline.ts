import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

type FunctionLike = ESTree.ArrowFunctionExpression | ESTree.Function;

type MaybeFunction = ESTree.Node | null | undefined;

function isFunctionLike(node: MaybeFunction): boolean {
	if (node === null || node === undefined) return false;
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionExpression" ||
		node.type === "FunctionDeclaration"
	);
}

function childNodes(node: ESTree.Node): Array<ESTree.Node> {
	const children: Array<ESTree.Node> = [];
	for (const key of Object.keys(node)) {
		if (key === "parent" || key === "loc" || key === "range") continue;
		const value = (node as unknown as Record<string, unknown>)[key];
		const candidates = Array.isArray(value) ? value : [value];
		for (const candidate of candidates) {
			if (
				candidate !== null &&
				typeof candidate === "object" &&
				typeof (candidate as ESTree.Node).type === "string"
			) {
				children.push(candidate as ESTree.Node);
			}
		}
	}
	return children;
}

function isOptionNone(argument: ESTree.Node | null | undefined): boolean {
	if (argument === null || argument === undefined || argument.type !== "CallExpression") {
		return false;
	}
	const callee = argument.callee;
	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "Identifier" &&
		callee.object.name === "Option" &&
		callee.property.type === "Identifier" &&
		callee.property.name === "none"
	);
}

/**
 * Count Option.none() returns in this function's own body. Nested scopes belong to
 * themselves, and loop bodies hold algorithmic exits rather than guard scatters.
 */
function countDirectNoneReturns(body: ESTree.Node): number {
	let count = 0;
	const visit = (node: ESTree.Node): void => {
		if (isFunctionLike(node)) return;
		if (
			node.type === "ForStatement" ||
			node.type === "ForInStatement" ||
			node.type === "ForOfStatement" ||
			node.type === "WhileStatement" ||
			node.type === "DoWhileStatement"
		) {
			return;
		}
		if (node.type === "ReturnStatement" && isOptionNone(node.argument)) count += 1;
		for (const child of childNodes(node)) visit(child);
	};
	visit(body);
	return count;
}

function declaresOptionReturn(node: FunctionLike): boolean {
	const returnType = node.returnType?.typeAnnotation;
	if (returnType === null || returnType === undefined) return false;
	if (returnType.type !== "TSTypeReference") return false;
	const typeName = returnType.typeName;
	if (typeName.type === "Identifier") return typeName.name === "Option";
	return (
		typeName.type === "TSQualifiedName" &&
		typeName.left.type === "Identifier" &&
		typeName.left.name === "Option" &&
		typeName.right.type === "Identifier" &&
		rightName(typeName.right) === "Option"
	);
}

function rightName(name: ESTree.TSTypeName): string | null {
	return name.type === "Identifier" ? name.name : null;
}

/** Guard-gauntlets over Option should compose into liftPredicate/filter pipelines. */
export const preferOptionPipelineRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require Option-returning functions to reject through composed pipelines (named Predicates lifted via Option.liftPredicate / narrowed via Option.filter) instead of scattering multiple `return Option.none()` guard exits through the body.",
		},
		messages: {
			preferPipeline:
				"This Option-returning function rejects through {{count}} scattered `Option.none()` guards. Extract named Predicates and compose them via pipe + Option.liftPredicate / Option.filter so the happy path reads as one pipeline.",
		},
	},
	create(context) {
		if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return {};
		const check = (node: FunctionLike): void => {
			if (!declaresOptionReturn(node)) return;
			if (node.body === null || node.body === undefined) return;
			const count = countDirectNoneReturns(node.body);
			if (count < 2) return;
			context.report({ node, messageId: "preferPipeline", data: { count: String(count) } });
		};
		return {
			ArrowFunctionExpression: check,
			FunctionExpression: check,
			FunctionDeclaration: check,
		};
	},
});
