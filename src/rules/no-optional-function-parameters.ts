import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { cast } from "../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

/** Structural view of a function-like visitor node. */
interface FunctionLike {
	readonly params: ReadonlyArray<ESTree.ParamPattern>;
}

/** Discriminant reader for engine nodes the typings leave loose. */
function typeOf(node: object): string {
	return cast<{ readonly type: string }>(node).type;
}

/** Unwrap TypeScript parameter-property wrappers to the annotated pattern. */
function annotatedPattern(parameter: ESTree.ParamPattern): ESTree.ParamPattern {
	return typeOf(parameter) === "TSParameterProperty"
		? cast<{ readonly parameter: ESTree.ParamPattern }>(parameter).parameter
		: parameter;
}

function isOptional(parameter: ESTree.ParamPattern): boolean {
	// Grammar-level optionality flag, present on every concrete ParamPattern shape.
	return cast<{ readonly optional?: boolean }>(annotatedPattern(parameter)).optional === true;
}

/** Optional parameters hide undefined from the signature; require the union spelled out. */
export const noOptionalFunctionParametersRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow optional function parameters (`param?:`); require an explicit union with undefined so callers see the possibility in the type.",
		},
		messages: {
			optionalParameter:
				"Optional parameters hide `undefined` from callers. Annotate the parameter as `T | undefined` so the possibility is spelled out in the type.",
		},
	},
	createOnce(context) {
		const check = (node: ESTree.Node): void => {
			for (const parameter of cast<FunctionLike>(node).params) {
				if (!isOptional(parameter)) continue;
				context.report({ node: parameter, messageId: "optionalParameter" });
			}
		};
		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			FunctionDeclaration: check,
			FunctionExpression: check,
			ArrowFunctionExpression: check,
		};
	},
});
