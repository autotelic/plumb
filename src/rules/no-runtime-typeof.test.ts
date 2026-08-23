import { identifiers, makeTester, wrap } from "./test-utils.ts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import type { Rule } from "@oxlint/plugins";
import { noRuntimeTypeofRule } from "./no-runtime-typeof.ts";

const rule = wrap("no-runtime-typeof", noRuntimeTypeofRule as unknown as Rule);
const tester = makeTester();

tester.run("no-runtime-typeof", rule, {
	valid: ["const n = value.toFixed(1);"],
	invalid: [{ code: "declare const v: number;\nif (typeof v === \"number\") { v.toFixed(1); }", errors: [{ messageId: "runtimeTypeof" }] }],
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
