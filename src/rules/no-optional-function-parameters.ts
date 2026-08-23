import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

import { cast } from "../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

/** Structural view of a function-like visitor node. */
interface FunctionLike {
	readonly params: ReadonlyArray<ESTree.ParamPattern>;
}

/**
 * Optional parameters hide undefined from the signature; require the union spelled out.
 *
 * Optionality is a grammar-level flag present on every concrete ParamPattern
 * shape, read after unwrapping TypeScript parameter-property wrappers.
 */
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
				const unwrapped =
					cast<{ readonly type: string }>(parameter).type === "TSParameterProperty"
						? cast<{ readonly parameter: ESTree.ParamPattern }>(parameter).parameter
						: parameter;
				if (cast<{ readonly optional?: boolean }>(unwrapped).optional !== true) continue;
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
