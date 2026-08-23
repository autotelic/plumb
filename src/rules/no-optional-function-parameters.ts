import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { cast } from "../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

/** Unwrap TypeScript parameter-property wrappers to the annotated pattern. */
function annotatedPattern(parameter: ESTree.ParamPattern): ESTree.ParamPattern {
	return parameter.type === "TSParameterProperty" ? parameter.parameter : parameter;
}

function isOptional(parameter: ESTree.ParamPattern): boolean {
	// SAFETY: optionality is a grammar-level field on every ParamPattern shape.
	return cast<{ optional?: boolean }>(annotatedPattern(parameter)).optional === true;
}

type FunctionNode =
	| ESTree.ArrowFunctionExpression
	| ESTree.FunctionDeclaration
	| ESTree.FunctionExpression;

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
				"Parameter `{{parameter}}` is optional. Spell the absence out: annotate it `T | undefined` so every caller sees undefined in the type.",
		},
	},
	createOnce(context) {
		const check = (node: FunctionNode): void => {
			for (const parameter of node.params) {
				if (!isOptional(parameter)) continue;
				context.report({
					node: parameter,
					messageId: "optionalParameter",
				});
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
