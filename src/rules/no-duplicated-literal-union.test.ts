import { RuleTester } from "oxlint/plugins-dev";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { testableRule, wireRuleTester } from "../testing/testable-rule.ts";
import { literalUnionKey, noDuplicatedLiteralUnionRule } from "./no-duplicated-literal-union.ts";

import type { ESTree } from "@oxlint/plugins";

/**
 * A union annotation over the given literal members.
 *
 * @param {readonly string[]} members - The literal members, in declaration order.
 * @returns {ESTree.TSType} A literal-union type annotation node.
 */
function unionOf(members: readonly string[]): ESTree.TSType {
	const types = members.map((member) => ({
		type: "TSLiteralType",
		literal: { type: "Literal", value: member },
	}));
	return { type: "TSUnionType", types } as unknown as ESTree.TSType;
}

describe("literalUnionKey", () => {
	it("ignores member order and separates different member sets", () => {
		fc.assert(
			fc.property(fc.uniqueArray(fc.stringMatching(/^[a-z]{1,4}$/u), { minLength: 1, maxLength: 5 }), (members) => {
				const key = literalUnionKey(unionOf(members));
				expect(literalUnionKey(unionOf([...members].reverse()))).toEqual(key);
				expect(literalUnionKey(unionOf([...members, "extra"]))).not.toEqual(key);
			}),
		);
	});
});

wireRuleTester({ describe, it });

const tester = new RuleTester();

tester.run(
	"no-duplicated-literal-union",
	// SAFETY: bridging across the two Rule declarations (plugins vs plugins-dev)
	// is the adapter's documented purpose.
	testableRule(noDuplicatedLiteralUnionRule) as never,
	{
		valid: [
			{ code: `type A = "x" | "y";`, filename: "a.ts" },
			{ code: `type B = "x" | "y";`, filename: "b.ts" },
			{ code: `type A = "x" | "y"; type B = "x" | "z";`, filename: "a.ts" },
		],
		invalid: [
			{
				code: `type C = "x" | "y"; type D = "y" | "x";`,
				filename: "c.ts",
				errors: [{ messageId: "duplicateUnion", data: { first: "C", second: "D" } }],
			},
		],
	},
);
