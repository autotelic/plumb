import { RuleTester } from "oxlint/plugins-dev";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { testableRule, wireRuleTester } from "../../testing/testable-rule.ts";
import { colorFindings, noOffTokenColorRule } from "./no-off-token-color.ts";

import type { ClassString } from "../tokens.ts";
import type { FileScope } from "../scope.ts";

wireRuleTester({ describe, it });

new RuleTester().run("no-off-token-color", testableRule(noOffTokenColorRule) as never, {
	valid: [
		{
			code: `export const Card = () => <div className="bg-primary-600 text-gray-100 p-4" />;`,
			filename: "app/routes/x/Card.tsx",
			options: [{ colors: ["primary", "gray"] }],
		},
		{
			code: `export const Card = () => <div className="text-white bg-black" />;`,
			filename: "app/routes/x/Card.tsx",
			options: [{ colors: ["primary"] }],
		},
		{
			code: `export const Button = () => <button className="bg-gray-500" />;`,
			filename: "app/components/ui/button.tsx",
			options: [{ allowPaths: ["app/components/ui"] }],
		},
		{
			code: `export const Menu = () => <div className="data-[state=open]:bg-blue-500" />;`,
			filename: "app/routes/x/Menu.tsx",
			options: [{ allowTokens: ["data-["] }],
		},
		{
			code: `export const label = "bg-gray-500";`,
			filename: "app/routes/x/labels.ts",
		},
		{
			code: `export const Card = () => <div className="bg-[#ffffff]" />;`,
			filename: "app/routes/x/Card.tsx",
			options: [{ reportArbitraryColors: false }],
		},
	],
	invalid: [
		{
			code: `export const Card = () => <div className="bg-gray-500" />;`,
			filename: "app/routes/x/Card.tsx",
			options: [{ colors: ["primary"] }],
			errors: [{ messageId: "offTokenColor" }],
		},
		{
			code: `export const Card = () => <div className={"bg-red-600 text-primary"} />;`,
			filename: "app/routes/x/Card.tsx",
			options: [{ colors: ["primary"] }],
			errors: [{ messageId: "offTokenColor" }],
		},
		{
			code: `const button = cva("p-2", { variants: { intent: { danger: "bg-red-600" } } });`,
			filename: "app/components/button.ts",
			options: [{ colors: ["primary"] }],
			errors: [{ messageId: "offTokenColor" }],
		},
		{
			code: `export const Card = () => <div className="bg-[#ffffff]" />;`,
			filename: "app/routes/x/Card.tsx",
			errors: [{ messageId: "arbitraryColor" }],
		},
		{
			code: `export const Card = ({ on }: { on: boolean }) => (
  <div className={on ? "bg-emerald-500" : "bg-primary-600"} />
);`,
			filename: "app/routes/x/Card.tsx",
			options: [{ colors: ["primary"] }],
			errors: [{ messageId: "offTokenColor" }],
		},
	],
});

describe("colorFindings", () => {
	const scope: FileScope = { path: "app/x.tsx", isJsx: true, colors: ["primary"], manifest: { colors: [], sharedRoots: [], localRoots: [], components: [] } };

	it("never reports a family the project declared", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.stringMatching(/^[a-z]{3,8}(?:-\\d{2,3})?$/u), { maxLength: 4 }),
				(tokens) => {
					const node = { type: "Literal" } as unknown as import("@oxlint/plugins").ESTree.Node;
					const classes: ClassString[] = [{ value: tokens.join(" "), node }];
					for (const finding of colorFindings({ classes, scope, allowTokens: [], reportArbitrary: true })) {
						expect(finding.family).not.toBe("primary");
					}
				},
			),
		);
	});

	it("finds every off-token family in a class string, allowlisted tokens excluded", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(
					fc.constantFrom("bg-gray-500", "text-primary-600", "border-red-600", "p-4", "text-white"),
					{ maxLength: 5 },
				),
				(tokens) => {
					const node = { type: "Literal" } as unknown as import("@oxlint/plugins").ESTree.Node;
					const classes: ClassString[] = [{ value: tokens.join(" "), node }];
					const findings = colorFindings({ classes, scope, allowTokens: [], reportArbitrary: true });
					const offToken = tokens.filter((token) => token === "bg-gray-500" || token === "border-red-600");
					expect(new Set(findings.map((finding) => finding.token))).toEqual(new Set(offToken));
				},
			),
		);
	});
});