import { RuleTester } from "oxlint/plugins-dev";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { testableRule, wireRuleTester } from "../../testing/testable-rule.ts";
import { layoutVerdict, noRawHtmlLayoutRule, type LayoutPolicy } from "./no-raw-html-layout.ts";

import type { ESTree } from "@oxlint/plugins";

wireRuleTester({ describe, it });

new RuleTester().run("no-raw-html-layout", testableRule(noRawHtmlLayoutRule) as never, {
	valid: [
		{
			code: `export const Card = () => <PageCard title="Hi" />;`,
			filename: "app/routes/x/Card.tsx",
		},
		{
			code: `export const Card = () => <Box className="p-4"><Text>Hi</Text></Box>;`,
			filename: "app/routes/x/Card.tsx",
		},
		{
			code: `export const Card = () => <div className="p-4" />;`,
			filename: "app/components/ui/box.tsx",
			options: [{ allowPaths: ["app/components/ui"] }],
		},
		{
			code: `export const Grid = () => <table className="w-full" />;`,
			filename: "app/components/DataTable.tsx",
			options: [{ allowNames: ["table"] }],
		},
		{
			code: `export const Card = () => <div className="p-4" />;`,
			filename: "app/routes/x/Card.tsx",
			options: [{ tags: ["section"] }],
		},
	],
	invalid: [
		{
			code: `export const Card = () => <div className="p-4" />;`,
			filename: "app/routes/x/Card.tsx",
			errors: [{ messageId: "rawLayoutTag" }],
		},
		{
			code: `export const Card = () => (
  <section className="p-4">
    <h2 className="text-xl">Title</h2>
    <p className="text-gray-100">Body</p>
  </section>
);`,
			filename: "app/routes/x/Card.tsx",
			errors: [{ messageId: "rawLayoutTag" }, { messageId: "rawLayoutTag" }, { messageId: "rawLayoutTag" }],
		},
		{
			code: `export const List = () => <ul className="list-none"><li>One</li></ul>;`,
			filename: "app/routes/x/List.tsx",
			options: [{ tags: ["ul", "li"], replacements: { ul: "Stack", li: "Text" } }],
			errors: [{ messageId: "rawLayoutTag" }, { messageId: "rawLayoutTag" }],
		},
	],
});

describe("layoutVerdict", () => {
	const element = (tag: string): ESTree.JSXOpeningElement =>
		({ type: "JSXOpeningElement", name: { type: "JSXIdentifier", name: tag } }) as unknown as ESTree.JSXOpeningElement;

	it("reports banned tags, never components, and honours allowlists", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<string>("div", "span", "section", "li", "PageCard", "Box", "svg", "Fragment"),
				fc.array<string>(fc.constantFrom<string>("div", "span", "section", "li", "svg"), { maxLength: 3 }),
				(tag, allowNames) => {
					const policy: LayoutPolicy = {
						tags: new Set(["div", "span", "section", "li"]),
						replacements: {},
						allowNames,
					};
					const verdict = layoutVerdict({ node: element(tag), policy });
					expect(verdict.report).toBe(
						!allowNames.includes(tag) && (["div", "span", "section", "li"] as readonly string[]).includes(tag),
					);
					if (verdict.report) expect(verdict.primitive).not.toBe("");
				},
			),
		);
	});

	it("prefers a configured replacement over the default primitive", () => {
		const policy: LayoutPolicy = { tags: new Set(["div"]), replacements: { div: "Stack" }, allowNames: [] };
		expect(layoutVerdict({ node: element("div"), policy }).primitive).toBe("Stack");
		expect(layoutVerdict({ node: element("p"), policy }).report).toBe(false);
	});
});