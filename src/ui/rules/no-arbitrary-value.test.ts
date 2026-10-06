import { RuleTester } from "oxlint/plugins-dev";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { testableRule, wireRuleTester } from "../../testing/testable-rule.ts";
import { arbitraryFindings, noArbitraryValueRule } from "./no-arbitrary-value.ts";

import type { ClassString } from "../tokens.ts";

wireRuleTester({ describe, it });

new RuleTester().run("no-arbitrary-value", testableRule(noArbitraryValueRule) as never, {
	valid: [
		{
			code: `export const Card = () => <div className="p-4 gap-2 rounded-lg" />;`,
			filename: "app/routes/x/Card.tsx",
		},
		{
			code: `export const Grid = () => <div className="grid grid-cols-[repeat(3,minmax(0,1fr))]" />;`,
			filename: "app/routes/x/Grid.tsx",
			options: [{ allowTokens: ["grid-cols-["] }],
		},
		{
			code: `export const Menu = () => <div className="data-[state=open]:p-4" />;`,
			filename: "app/routes/x/Menu.tsx",
			options: [{ allowTokens: ["data-["] }],
		},
		{
			code: `export const Card = () => <div className="p-[17px]" />;`,
			filename: "app/generated/Card.tsx",
			options: [{ allowPaths: ["app/generated"] }],
		},
		{
			code: `export const Card = () => <div className="bg-[#ffffff]" />;`,
			filename: "app/routes/x/Card.tsx",
		},
		{
			code: `export const Card = () => <div className="p-[17px]" />;`,
			filename: "app/routes/x/Card.tsx",
			options: [{ skipColorLiterals: false, allowTokens: ["p-[17px]"] }],
		},
	],
	invalid: [
		{
			code: `export const Card = () => <div className="p-[17px]" />;`,
			filename: "app/routes/x/Card.tsx",
			errors: [{ messageId: "arbitraryValue" }],
		},
		{
			code: `export const Row = () => <div className={"flex w-[calc(100%-1rem)] gap-2"} />;`,
			filename: "app/routes/x/Row.tsx",
			errors: [{ messageId: "arbitraryValue" }],
		},
		{
			code: `export const Panel = ({ open }: { open: boolean }) => (
  <div className={open ? "max-h-[60vh]" : "max-h-full"} />
);`,
			filename: "app/routes/x/Panel.tsx",
			errors: [{ messageId: "arbitraryValue" }],
		},
		{
			code: `const chip = cva("p-1", { variants: { size: { lg: "text-[13px]" } } });`,
			filename: "app/components/chip.ts",
			errors: [{ messageId: "arbitraryValue" }],
		},
		{
			code: `export const Card = () => <div className="bg-[#ffffff]" />;`,
			filename: "app/routes/x/Card.tsx",
			options: [{ skipColorLiterals: false }],
			errors: [{ messageId: "arbitraryValue" }],
		},
	],
});

describe("arbitraryFindings", () => {
	it("finds exactly the arbitrary tokens left after the allowlist", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(
					fc.constantFrom("p-4", "p-[17px]", "w-[calc(100%-1rem)]", "text-[13px]", "bg-[#fff]", "gap-2"),
					{ maxLength: 5 },
				),
				(tokens) => {
					const node = { type: "Literal" } as unknown as import("@oxlint/plugins").ESTree.Node;
					const classes: ClassString[] = [{ value: tokens.join(" "), node }];
					const findings = arbitraryFindings({ classes, allowTokens: [], skipColorLiterals: true });
					const expected = tokens.filter(
						(token) => token.includes("[") && !token.startsWith("bg-[#"),
					);
					expect(findings.map((finding) => finding.token)).toEqual(expected);
				},
			),
		);
	});

	it("never reports a token the allowlist claims", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.constantFrom("data-[", "grid-cols-[", "p-["), { minLength: 1, maxLength: 3 }),
				(allowTokens) => {
					const node = { type: "Literal" } as unknown as import("@oxlint/plugins").ESTree.Node;
					const token = `${allowTokens[0]}value]`;
					const classes: ClassString[] = [{ value: token, node }];
					expect(
						arbitraryFindings({ classes, allowTokens, skipColorLiterals: false }),
					).toEqual([]);
				},
			),
		);
	});
});