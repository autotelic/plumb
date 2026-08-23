import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import { ancestorsOf } from "../../shared/ancestors.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

const commentOwnerKinds = new Set([
	"ExpressionStatement",
	"ReturnStatement",
	"ThrowStatement",
	"VariableDeclaration",
]);

function isJsonParseCall(node: ESTree.CallExpression): boolean {
	const callee = node.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "JSON" &&
		callee.property.type === "Identifier" &&
		callee.property.name === "parse"
	);
}

/** Whether the nearest annotated function returns through the Effect/Either/Option channel. */
function insideChannelReturningFunction(sourceCode: SourceCode, node: ESTree.Node): boolean {
	const chain = ancestorsOf(sourceCode, node);
	for (let index = chain.length - 1; index >= 0; index--) {
		const current = chain[index]!;
		if (current.type === "Program") break;
		const fn = current as unknown as { returnType?: { typeAnnotation?: ESTree.TSType } };
		if (
			(current.type === "FunctionDeclaration" ||
				current.type === "FunctionExpression" ||
				current.type === "ArrowFunctionExpression") &&
			fn.returnType != null &&
				fn.returnType.typeAnnotation != null
		) {
			const text = annotationText(fn.returnType.typeAnnotation);
			if (/\b(?:Effect|Either|Option)(?:\.|\b)/u.test(text)) return true;
		}
	}
	return false;
}

/** Render an annotation to text so qualified names like Effect.Effect match. */
function annotationText(type: ESTree.TSType): string {
	switch (type.type) {
		case "TSTypeReference": {
			const name = type.typeName;
			const head =
				name.type === "Identifier"
					? name.name
					: name.type === "TSQualifiedName"
						? name.right.name
						: "";
			const args = (type as { typeArguments?: { params?: Array<ESTree.TSType> } }).typeArguments;
			const renderedArgs = args?.params?.map(annotationText).join(" ") ?? "";
			return `${head} ${renderedArgs}`;
		}
		case "TSUnionType":
		case "TSIntersectionType":
			return type.types.map(annotationText).join(" ");
		case "TSTupleType":
			return type.elementTypes.map((element) => {
				const payload = (element as { elementType?: ESTree.TSType }).elementType ?? element;
				return annotationText(payload as ESTree.TSType);
			}).join(" ");
		case "TSTypeOperator":
			return annotationText(type.typeAnnotation);
		case "TSArrayType":
			return annotationText(type.elementType);
		default:
			return "";
	}
}

function isEffectTryCall(node: ESTree.Node): boolean {
	if (node.type !== "CallExpression") return false;
	const callee = node.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.object.type === "Identifier" &&
		callee.object.name === "Effect" &&
		callee.property.type === "Identifier" &&
		(callee.property.name === "try" || callee.property.name === "trySync")
	);
}

/**
 * Whether the parse sits inside a JS try block or the `try` thunk of an
 * `Effect.try` call. Crossing a function boundary is allowed only when that
 * function is itself handed straight to `Effect.try`.
 */
function isGuardedParse(sourceCode: SourceCode, node: ESTree.Node): boolean {
	// Nearest-first chain; probe resumes mid-chain when climbing past pure containers.
	// Manual index control: resuming at a probe must re-process the probe itself.
	const chain = [...ancestorsOf(sourceCode, node)].reverse();
	let index = 0;
	while (index < chain.length) {
		const current = chain[index]!;
		if (current.type === "Program") return false;
		if (current.type === "TryStatement") return true;
		if (isEffectTryCall(current)) return true;
		if (
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression" ||
			current.type === "ArrowFunctionExpression"
		) {
			// A thunk may be handed straight to Effect.try through an object literal
			// ({ try: () => ..., catch: ... }); climb past pure containers to check.
			let probeIndex = index + 1;
			while (
				probeIndex < chain.length &&
				(chain[probeIndex]!.type === "Property" ||
					chain[probeIndex]!.type === "ObjectExpression" ||
					chain[probeIndex]!.type === "ArrayExpression")
			) {
				probeIndex += 1;
			}
			if (probeIndex < chain.length && isEffectTryCall(chain[probeIndex]!)) {
				index = probeIndex;
				continue;
			}
			return false;
		}
		index += 1;
	}
	return false;
}

function hasSafetyComment(sourceCode: SourceCode, node: ESTree.Node): boolean {
	// Walk outward from the assertion itself, stopping before the Program root.
	const chain: Array<ESTree.Node> = [node, ...[...ancestorsOf(sourceCode, node)].reverse()];
	for (let index = 0; index < chain.length; index += 1) {
		const current = chain[index]!;
		if (
			sourceCode
				.getCommentsBefore(current)
				.some((comment) => (comment as unknown as { end: number }).end <= node.start && /\bSAFETY\s*:/u.test(comment.value))
		) {
			return true;
		}
		if (commentOwnerKinds.has(current.type)) return false;
		const parent = chain[index + 1];
		if (parent === undefined || parent.type === "Program") return false;
	}
	return false;
}

/**
 * JSON.parse throws a raw SyntaxError defect. Inside an Effect/Either/Option
 * channel that bypasses the typed failure path unless explicitly guarded.
 */
export const noUnguardedJsonParseRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require JSON.parse inside Effect/Either/Option-returning functions to be channelled through Effect.try (or a try/catch), or justified with a SAFETY comment for provably-total parses.",
		},
		messages: {
			unguardedParse:
				"`JSON.parse` here throws a raw SyntaxError defect past the typed error channel. Channel it with `Effect.try({ try: ..., catch: ... })` failing a tagged reason (e.g. MalformedRenderError), or justify totality with a `SAFETY:` comment.",
		},
	},
	createOnce(context) {
		return {
		before() {
			if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
		},
			CallExpression(node) {
				if (!isJsonParseCall(node)) return;
				if (!insideChannelReturningFunction(context.sourceCode, node)) return;
				if (isGuardedParse(context.sourceCode, node)) return;
				if (hasSafetyComment(context.sourceCode, node)) return;
				context.report({ node, messageId: "unguardedParse" });
			},
		};
	},
});
