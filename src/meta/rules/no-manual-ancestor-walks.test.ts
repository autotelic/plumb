import { eslintCompatPlugin } from "@oxlint/plugins";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import { noManualAncestorWalksRule } from "./no-manual-ancestor-walks.ts";

import type { ESTree } from "@oxlint/plugins";

type Recorded = { messageId: string };

function collect(node: ESTree.MemberExpression): Array<Recorded> {
	const reports: Array<Recorded> = [];
	const plugin = eslintCompatPlugin({
		meta: { name: "plumb-meta" },
		rules: { x: noManualAncestorWalksRule },
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- harness drives the compat wrapper directly
	const visitor = (plugin.rules.x as any).create({ report: (d: Recorded) => reports.push(d) });
	visitor["MemberExpression"](node);
	return reports;
}

function memberExpression(computed: boolean, propertyName_: string): ESTree.MemberExpression {
	return {
		type: "MemberExpression",
		computed,
		object: { type: "Identifier", name: "node" },
		property: { type: "Identifier", name: propertyName_ },
	} as unknown as ESTree.MemberExpression;
}

const propertyNames = fc.constantFrom("parent", "body", "properties", "callee", "name", "id") as fc.Arbitrary<string>;

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

const wrapped = eslintCompatPlugin({
	meta: { name: "plumb-meta" },
	rules: { "no-manual-ancestor-walks": noManualAncestorWalksRule },
}).rules["no-manual-ancestor-walks"];

ruleTester.run(
	"no-manual-ancestor-walks",
	// The compat wrapper's runtime shape satisfies RuleTester; its static type union does not.
	wrapped as unknown as Parameters<typeof ruleTester.run>[1],
	{
	valid: ["const first = list[0];", 'node["parent"];', "const n = ast.body;"],
	invalid: [
		{
			code: "let current = node.parent;",
			errors: [{ messageId: "useGetAncestors" }],
		},
	],
});

describe("no-manual-ancestor-walks properties", () => {
	it("reports exactly when a non-computed `.parent` access is present", () => {
		fc.assert(
			fc.property(fc.boolean(), propertyNames, (computed, name) => {
				const reports = collect(memberExpression(computed, name));
				const shouldReport = !computed && name === "parent";
				expect(reports).toHaveLength(shouldReport ? 1 : 0);
			}),
		);
	});
});
