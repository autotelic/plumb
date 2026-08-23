import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";
import { isRecordObject, isString } from "../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

/** Keyword node type -> spelled-out primitive for messages. */
const PRIMITIVE_KEYWORDS = new Map<string, string>([
	["TSStringKeyword", "string"],
	["TSNumberKeyword", "number"],
	["TSBooleanKeyword", "boolean"],
	["TSBigIntKeyword", "bigint"],
]);

const PRIMITIVES: ReadonlySet<string> = new Set(PRIMITIVE_KEYWORDS.values());

/** Bare primitive annotation on a positional parameter, e.g. `userId: string`. */
function barePrimitive(param: ESTree.BindingPattern): string | null {
	if (param.type !== "Identifier") return null;
	const annotation = param.typeAnnotation?.typeAnnotation;
	if (!isRecordObject(annotation)) return null;
	return PRIMITIVE_KEYWORDS.get(annotation.type) ?? null;
}

function declaredStatement(statement: ESTree.Statement): ESTree.Node | null {
	return statement.type === "ExportNamedDeclaration" ||
		statement.type === "ExportDefaultDeclaration"
		? (statement.declaration ?? null)
		: statement;
}

interface FnLike {
	params: Array<ESTree.BindingPattern>;
}

function swappableRuns(fn: FnLike): Array<{ primitive: string; count: number }> {
	const found: Array<{ primitive: string; count: number }> = [];
	let runPrimitive: string | null = null;
	let runLength = 0;
	for (const param of fn.params) {
		const primitive = barePrimitive(param);
		if (primitive !== null && primitive === runPrimitive) {
			runLength += 1;
		} else {
			if (runPrimitive !== null && runLength >= 2)
				found.push({ primitive: runPrimitive, count: runLength });
			runPrimitive = primitive;
			runLength = 1;
		}
	}
	if (runPrimitive !== null && runLength >= 2)
		found.push({ primitive: runPrimitive, count: runLength });
	return found;
}

/** Adjacent same-primitive parameters compile despite swaps; require distinct brands. */
export const noSwappablePrimitiveParamsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow exported functions with two or more adjacent parameters annotated as the same bare primitive (string, number, boolean, bigint); accidental argument swaps compile silently. Require distinct branded types instead.",
		},
		messages: {
			swappablePrimitiveParams:
				"`{{name}}` takes {{count}} adjacent `{{primitive}}` parameters, so a swapped call compiles. Brand each one (e.g. `type UserId = string & Brand.Brand<\"UserId\">`) so the compiler rejects transposed arguments.",
		},
	},
	createOnce(context) {
		const reportFn = (name: string, id: ESTree.BindingIdentifier | null, fn: FnLike): void => {
			const runs = swappableRuns(fn);
			if (runs.length === 0) return;
			const firstRun = runs[0];
			if (firstRun === undefined) return;
			context.report({
				node: id ?? fn as unknown as ESTree.Node,
				messageId: "swappablePrimitiveParams",
				data: { name, primitive: firstRun.primitive, count: String(firstRun.count) },
			});
		};
		return {
		before() {
			if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
		},
			Program(node) {
				for (const statement of node.body) {
					const declaration = declaredStatement(statement);
					if (declaration === null) continue;
					if (declaration.type === "FunctionDeclaration" && declaration.id !== null) {
						reportFn(declaration.id.name, declaration.id, declaration as unknown as FnLike);
					}
					if (declaration.type === "VariableDeclaration") {
						for (const declarator of declaration.declarations) {
							if (declarator.id.type !== "Identifier") continue;
							const init = declarator.init;
							if (
								init?.type === "ArrowFunctionExpression" ||
								init?.type === "FunctionExpression"
							) {
								reportFn(declarator.id.name, declarator.id, init as unknown as FnLike);
							}
						}
					}
				}
			},
		};
	},
});
