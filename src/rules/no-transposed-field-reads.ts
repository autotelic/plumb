import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

interface Options {
	readonly groups?: ReadonlyArray<readonly string[]>;
}

/** A direct field pluck: `base.field` with an identifier property (no arithmetic, no nesting). */
interface FieldPluck {
	readonly baseText: string;
	readonly field: string;
	readonly position: number;
}

function unwrapParentheses(expression: ESTree.Expression): ESTree.Expression {
	let current = expression;
	while (current.type === "ParenthesizedExpression") current = current.expression;
	return current;
}

/** The `base.field` pluck of a direct member read, or null for anything more elaborate. */
function directPluck(
	expression: ESTree.Expression | null | undefined,
	getText: (node: ESTree.Node) => string,
): { baseText: string; field: string } | null {
	if (expression === undefined || expression === null) return null;
	const member = unwrapParentheses(expression);
	if (member.type !== "MemberExpression" || member.computed || member.property.type !== "Identifier") {
		return null;
	}
	return { baseText: getText(member.object), field: member.property.name };
}

/**
 * Flag argument lists and object literals that pluck two or more role fields
 * off the same base expression in reversed canonical order — the syntactic
 * fingerprint of inline structural surgery on a domain value (e.g. a
 * hand-rolled reciprocal). Such shuffles belong behind a named operation
 * that owns the invariant.
 */
export const noTransposedFieldReadsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow directly reading two or more configured role fields from the same expression in reversed order inside call arguments or object literals; require a named domain operation instead.",
		},
		messages: {
			transposedFieldReads:
				"`{{base}}.{{first}}` is read after `{{base}}.{{second}}`, reversing the canonical order {{group}}; this looks like inline structural surgery on a domain value. Use a named operation instead of shuffling its fields by hand.",
		},
		schema: [
			{
				type: "object",
				properties: {
					groups: {
						type: "array",
						items: { type: "array", items: { type: "string" }, minItems: 2 },
						minItems: 1,
					},
				},
				additionalProperties: false,
			},
		],
		defaultOptions: [{ groups: [["numerator", "denominator"]] }],
	},
	createOnce(context) {
		const option = context.options?.[0];
		const rawGroups =
			typeof option === "object" && option !== null && !Array.isArray(option)
				? (option as Options).groups
				: undefined;
		const groups = (rawGroups ?? [["numerator", "denominator"]]).map((fields) => ({
			order: new Map(fields.map((field, index) => [field, index])),
			label: fields.join(" → "),
		}));

		const checkSequence = (
			node: ESTree.Node,
			parts: ReadonlyArray<{ expression: ESTree.Expression | null | undefined }>,
		): void => {
			const getText = (target: ESTree.Node): string => context.sourceCode.getText(target);
			const plucks: Array<FieldPluck> = [];
			for (const [position, part] of parts.entries()) {
				const direct = directPluck(part.expression, getText);
				if (direct === null) continue;
				plucks.push({ ...direct, position });
			}
			for (const group of groups) {
				const inGroup = plucks.filter((pluck) => group.order.has(pluck.field));
				for (const later of inGroup) {
					for (const earlier of inGroup) {
						if (earlier.baseText !== later.baseText || earlier.position >= later.position) continue;
						if ((group.order.get(earlier.field) ?? 0) > (group.order.get(later.field) ?? 0)) {
							context.report({
								node,
								messageId: "transposedFieldReads",
								data: {
									base: earlier.baseText,
									first: later.field,
									second: earlier.field,
									group: group.label,
								},
							});
							break;
						}
					}
				}
			}
		};

		return {
			CallExpression(node) {
				checkSequence(node, node.arguments.map((argument) => ({ expression: argument as ESTree.Expression })));
			},
			ObjectExpression(node) {
				checkSequence(
					node,
					node.properties.map((property) =>
						property.type === "Property" ? { expression: property.value } : { expression: undefined },
					),
				);
			},
		};
	},
});
