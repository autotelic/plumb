import { identifiers, makeTester, wrap } from "./test-utils.ts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import type { Rule } from "@oxlint/plugins";
import { noReflectApplyRule } from "./no-reflect-apply.ts";

const rule = wrap("no-reflect-apply", noReflectApplyRule as unknown as Rule);
const tester = makeTester();

tester.run("no-reflect-apply", rule, {
	valid: ["obj.method(args);", "const r = fn(1, 2);"],
	invalid: [{ code: "Reflect.apply(fn, null, args);", errors: [{ messageId: "reflectApply" }] }],
});

// Generated identifier variants must stay unflagged (collection-time property).
fc.assert(
	fc.property(identifiers, (prop: string) => {
		let flagged = false;
		try {
			tester.run("probe", rule, { valid: [`const v = obj.${prop};`], invalid: [] });
		} catch {
			flagged = true;
		}
		expect(flagged).toBe(false);
	}),
);
