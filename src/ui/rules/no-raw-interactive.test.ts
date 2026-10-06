import { RuleTester } from "oxlint/plugins-dev";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { testableRule, wireRuleTester } from "../../testing/testable-rule.ts";
import { interactiveVerdict, noRawInteractiveRule, type InteractivePolicy } from "./no-raw-interactive.ts";

import type { ESTree } from "@oxlint/plugins";

wireRuleTester({ describe, it });

new RuleTester().run("no-raw-interactive", testableRule(noRawInteractiveRule) as never, {
	valid: [
		{
			code: `export const Row = () => <TableRow onSelect={onSelect} />;`,
			filename: "app/routes/x/Row.tsx",
		},
		{
			code: `export const Card = () => (
  <Stack>
    <Button variant="primary">Save</Button>
    <NavLink to="/x">Back</NavLink>
  </Stack>
);`,
			filename: "app/routes/x/Card.tsx",
		},
		{
			code: `export const Button = (props: ButtonProps) => <button {...props} />;`,
			filename: "app/components/ui/button.tsx",
			options: [{ allowPaths: ["app/components/ui"] }],
		},
		{
			code: `export const Field = () => <input defaultValue="x" />;`,
			filename: "app/routes/x/Field.tsx",
			options: [{ allowNames: ["input"] }],
		},
		{
			code: `export const Button = () => <button type="submit" />;`,
			filename: "app/routes/x/Button.tsx",
			options: [{ tags: ["a"] }],
		},
	],
	invalid: [
		{
			code: `export const Save = () => <button className="p-2">Save</button>;`,
			filename: "app/routes/x/Save.tsx",
			options: [{ replacements: { button: "Button" } }],
			errors: [{ messageId: "rawInteractiveTag" }],
		},
		{
			code: `export const Field = () => (
  <form>
    <input name="email" />
    <select name="role"><option>Admin</option></select>
    <textarea name="notes" />
    <a href="/x">Back</a>
  </form>
);`,
			filename: "app/routes/x/Field.tsx",
			errors: [
				{ messageId: "rawInteractiveTag" },
				{ messageId: "rawInteractiveTag" },
				{ messageId: "rawInteractiveTag" },
				{ messageId: "rawInteractiveTag" },
			],
		},
	],
});

describe("interactiveVerdict", () => {
	const element = (tag: string): ESTree.JSXOpeningElement =>
		({ type: "JSXOpeningElement", name: { type: "JSXIdentifier", name: tag } }) as unknown as ESTree.JSXOpeningElement;

	it("reports banned tags only, honouring replacements and allowlists", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("a", "button", "input", "select", "textarea", "Button", "Form", "svg"),
				fc.boolean(),
				(tag, allowButton) => {
					const policy: InteractivePolicy = {
						tags: new Set(["a", "button", "input", "select", "textarea"]),
						replacements: {},
						allowNames: allowButton ? ["button"] : [],
					};
					const verdict = interactiveVerdict({ node: element(tag), policy });
					const expected = ["a", "button", "input", "select", "textarea"].includes(tag) && !(allowButton && tag === "button");
					expect(verdict.report).toBe(expected);
				},
			),
		);
	});
});