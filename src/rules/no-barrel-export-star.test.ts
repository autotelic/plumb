import { identifiers, makeTester, wrap } from "./test-utils.ts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import type { Rule } from "@oxlint/plugins";
import { noBarrelExportStarRule } from "./no-barrel-export-star.ts";

const rule = wrap("no-barrel-export-star", noBarrelExportStarRule as unknown as Rule);
const tester = makeTester();

tester.run("no-barrel-export-star", rule, {
	valid: ["export { specific } from \"./mod\";"],
	invalid: [{ code: "export * from \"./mod\";", errors: [{ messageId: "erasesForwardedNames" }] }],
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
