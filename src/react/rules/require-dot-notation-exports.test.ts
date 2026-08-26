import { RuleTester } from "oxlint/plugins-dev";

import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { testableRule, wireRuleTester } from "../../testing/testable-rule.ts";
import { requireDotNotationExportsRule, familyRequiresAggregate } from "./require-dot-notation-exports.ts";

wireRuleTester({ describe, it });

new RuleTester().run("require-dot-notation-exports", testableRule(requireDotNotationExportsRule) as never, {
	valid: [
		{
			code: `export function Provider() { return null; }
export function useExpenseCategory() { return null; }
export const ExpenseCategory = {
  Provider,
  useExpenseCategory,
};`,
			filename: "a.ts",
		},
	],
	invalid: [
		{
			code: `export function Provider() { return null; }
export function useExpenseCategory() { return null; }`,
			filename: "a.ts",
			errors: [{ messageId: "missingAggregate" }],
		},
	],
});

describe("require-dot-notation-exports property", () => {
	it("familyRequiresAggregate is true iff a Provider+hook family lacks an aggregate", () => {
		fc.assert(
			fc.property(
				fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()),
				([hasProvider, hasHook, aggregateOk]) => {
					expect(familyRequiresAggregate({ hasProvider, hasHook, aggregateOk })).toBe(
						hasProvider && hasHook && !aggregateOk,
					);
				},
			),
		);
	});
});
