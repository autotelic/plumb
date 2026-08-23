import { identifiers, makeTester, wrap } from "./test-utils.ts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import type { Rule } from "@oxlint/plugins";
import { noImpossibleBranchThrowRule } from "./no-impossible-branch-throw.ts";

const rule = wrap("no-impossible-branch-throw", noImpossibleBranchThrowRule as unknown as Rule);
const tester = makeTester();

tester.run("no-impossible-branch-throw", rule, {
	valid: ["if (!ready) throw new Error(\"not ready\");", "throw new Error(\"unexpected but possible\");"],
	invalid: [{ code: "if (x > 0) { throw new Error(\"this can never happen\"); }", errors: [{ messageId: "impossibleThrow" }] }],
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
