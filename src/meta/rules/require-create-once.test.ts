import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import { requireCreateOnceRule } from "./require-create-once.ts";

import type { ESTree } from "@oxlint/plugins";

type Recorded = { messageId: string };

function collect(properties: ReadonlyArray<string>): Array<Recorded> {
	const reports: Array<Recorded> = [];
	const node = {
		type: "ObjectExpression",
		properties: properties.map((name) => ({
			type: "Property",
			computed: false,
			key: { type: "Identifier", name },
		})),
	} as unknown as ESTree.ObjectExpression;
	const plugin = eslintCompatPlugin({
		meta: { name: "plumb-meta" },
		rules: { x: requireCreateOnceRule },
	});
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- harness drives the compat wrapper directly
	const visitor = (plugin.rules.x as any).create({ report: (d: Recorded) => reports.push(d) });
	visitor["ObjectExpression"](node);
	return reports;
}

const objectKeys = fc.constantFrom("meta", "rules", "create", "createOnce", "docs") as fc.Arbitrary<string>;

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

const pluginWithCreate = `		defineRule({
			meta: { name: "x" },
			create(context) {
				return {};
			},
		})`; 

const wrappedRule = eslintCompatPlugin({
	meta: { name: "plumb-meta" },
	rules: { "require-create-once": requireCreateOnceRule },
}).rules["require-create-once"];

ruleTester.run(
	"require-create-once",
	wrappedRule as unknown as Parameters<typeof ruleTester.run>[1],
	{
	valid: [
		`defineRule({
			meta: { name: "x" },
			createOnce(context) {
				return {};
			},
		})`,
	],
	invalid: [
		{
			code: pluginWithCreate,
			errors: [{ messageId: "useCreateOnce" }],
		},
	],
});

describe("require-create-once properties", () => {
	it("flags `create` exactly when the object also declares `meta`", () => {
		fc.assert(
			fc.property(fc.array(objectKeys, { minLength: 0, maxLength: 5 }), (keys) => {
				const reports = collect(keys);
				const shouldReport = keys.includes("create") && keys.includes("meta");
				expect(reports).toHaveLength(shouldReport ? 1 : 0); // duplicate keys are pathological; rule flags create once
			}),
		);
	});
});
