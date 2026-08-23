import { identifiers, wrap, makeTester } from "./test-utils.ts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import type { Rule } from "@oxlint/plugins";
import { noReflectGetRule } from "./no-reflect-get.ts";

const rule = wrap("no-reflect-get", noReflectGetRule as unknown as Rule);
const tester = makeTester();

tester.run("no-reflect-get", rule, {
	valid: ['const v = obj.name;', 'Reflect.set(obj, "k", 1);'],
	invalid: [{ code: 'Reflect.get(obj, "name");', errors: [{ messageId: "reflectGet" }] }],
});

// Property executes at collection time: generated variants must stay unflagged.
fc.assert(
	fc.property(identifiers, (prop: string) => {
		let flagged = false;
		try {
			tester.run(
				"probe",
				rule,
				{ valid: [`const v = obj.${prop};`], invalid: [] },
			);
		} catch {
			flagged = true;
		}
		expect(flagged).toBe(false);
	}),
);

