import { defineRule } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vitest";

import { testableRule } from "./testable-rule.ts";

const tinyRule = defineRule({
	meta: {
		messages: { hit: "hit" },
	},
	createOnce(context) {
		return {
			before() {
				if (context.filename.includes("skipped")) return false;
			},
			CallExpression(node) {
				context.report({ node, messageId: "hit" });
			},
		};
	},
});

const tester = new RuleTester();

tester.run(
	"testableRule end-to-end",
	// SAFETY: bridging across the two Rule declarations (plugins vs plugins-dev)
	// is the adapter's documented purpose.
	testableRule(tinyRule) as never,
	{
		valid: [{ code: `foo();`, filename: "skipped/mine.ts" }],
		invalid: [{ code: `foo();`, errors: [{ messageId: "hit" }] }],
	},
);

describe("testableRule", () => {
	it("passes plain ESLint-style rules through untouched", () => {
		const plain = { meta: {}, create: () => ({}) };
		expect(testableRule(plain as never)).toBe(plain);
	});

	it("chains the rule's own Program:exit with the after hook, in order", () => {
		const calls: string[] = [];
		const rule = defineRule({
			meta: { messages: {} },
			createOnce() {
				return {
					after() {
						calls.push("after");
					},
					"Program:exit"() {
						calls.push("rule-exit");
					},
				};
			},
		});
		// SAFETY: structural view of the adapted rule for direct invocation.
		const adapted = testableRule(rule) as unknown as {
			create(context: never): Record<string, (() => void) | undefined>;
		};
		const context = null as never;
		const visitor = adapted.create(context);
		const programExit = visitor["Program:exit"];
		if (programExit === undefined) throw new Error("missing Program:exit hook");
		programExit();
		expect(calls).toEqual(["rule-exit", "after"]);
	});
});
