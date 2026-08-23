import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

/** Generic built-in errors: untyped, prose-only, and invisible to tag-based handling. */
const BUILTIN_ERRORS: ReadonlySet<string> = new Set([
	"Error",
	"EvalError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"TypeError",
	"URIError",
	"AggregateError",
]);

interface Options {
	readonly allow?: ReadonlyArray<string>;
}

function unwrapParentheses(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (current.type === "ParenthesizedExpression") current = current.expression;
	return current;
}

/**
 * Flag throwing generic built-in errors at call sites that should instead throw
 * a project-defined tagged error carrying its evidence structurally (e.g.
 * Data.TaggedError with operation/value/domain fields plus a rendered message).
 */
export const noBuiltinThrowsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow throwing built-in Error constructors; require project-defined tagged error classes so defects carry structured evidence and can be matched by tag.",
		},
		messages: {
			noBuiltinThrows:
				"Throwing the built-in `{{builtin}}` loses structure: consumers get prose only. Throw a project-defined tagged error (e.g. Data.TaggedError) whose fields carry the operation, offending value, and domain, and render this context as its message.",
		},
		schema: [
			{
				type: "object",
				properties: {
					allow: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ allow: [] }],
	},
	create(context) {
		if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return {};
		const option = context.options?.[0];
		const allowed: ReadonlySet<string> = new Set(
			typeof option === "object" && option !== null && !Array.isArray(option)
				? ((option as Options).allow ?? [])
				: [],
		);
		return {
			ThrowStatement(node) {
				const argument = node.argument === null || node.argument === undefined ? undefined : unwrapParentheses(node.argument);
				if (argument?.type !== "NewExpression") return;
				if (argument.callee.type !== "Identifier") return;
				const builtin = argument.callee.name;
				if (!BUILTIN_ERRORS.has(builtin) || allowed.has(builtin)) return;
				context.report({ node, messageId: "noBuiltinThrows", data: { builtin } });
			},
		};
	},
});
