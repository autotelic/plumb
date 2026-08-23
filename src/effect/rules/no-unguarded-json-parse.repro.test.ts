import { defineRule, eslintCompatPlugin } from "@oxlint/plugins";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import { noUnguardedJsonParseRule } from "./no-unguarded-json-parse.ts";

const wrapped = eslintCompatPlugin({
	meta: { name: "plumb-effect" },
	rules: { "no-unguarded-json-parse": noUnguardedJsonParseRule },
}).rules["no-unguarded-json-parse"];

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

function expectGuarded(code: string): void {
	// RuleTester.run throws when a `valid` case produces a diagnostic.
	let threw = false;
	try {
		ruleTester.run(
			"no-unguarded-json-parse",
			wrapped as unknown as Parameters<typeof ruleTester.run>[1],
			{ valid: [code], invalid: [] },
		);
	} catch {
		threw = true;
	}
	expect(threw, `rule flagged guarded parse:\n${code}`).toBe(false);
}

function guardedThroughContainers(containers: ReadonlyArray<string>, inputName: string): string {
	let config = `{ try: () => JSON.parse(${inputName}), catch: (e) => new Error(String(e)) }`;
	for (const kind of [...containers].reverse()) {
		config = kind === "array" ? `[${config}]` : `{ wrapped: ${config} }`;
	}
	return `\n	const x = (${inputName}: string): Effect.Effect<unknown, Error> =>\n	\tEffect.try(${config});`;
}

describe("corpus regression: container-climbing probe", () => {
	// Canonical RuleTester runs stay at describe level: vitest forbids nested suites.
	ruleTester.run(
		"no-unguarded-json-parse (gen/yield* shape)",
		wrapped as unknown as Parameters<typeof ruleTester.run>[1],
		{
			valid: [
				`const x = (input: string): Effect.Effect<number, Error> =>
					Effect.gen(function* () {
						const parsed: unknown = yield* Effect.try({
							try: () => JSON.parse(input),
							catch: (e) => new Error(String(e)),
						});
						return parsed;
					});`,
			],
			invalid: [],
		},
	);

	ruleTester.run(
		"no-unguarded-json-parse (direct thunk shape)",
		wrapped as unknown as Parameters<typeof ruleTester.run>[1],
		{
			valid: [
				`const x = (input: string): Effect.Effect<number, Error> =>
					Effect.try({
						try: () => JSON.parse(input),
						catch: (e) => new Error(String(e)),
					});`,
			],
			invalid: [],
		},
	);

	it("stays guarded under arbitrary pure-container wrapping of the config", () => {
		// Programmatic batch runs would re-enter vitest through the wired suite hooks;
		// stub them so run() executes cases inline.
		const previousDescribe = RuleTester.describe;
		const previousIt = RuleTester.it;
		RuleTester.describe = () => {};
		RuleTester.it = (_name, fn) => {
			fn();
		};
		const flagged: Array<string> = [];
		try {
			fc.assert(
				fc.property(
					fc.array(fc.constantFrom("array", "object") as fc.Arbitrary<string>, { maxLength: 3 }),
					fc.stringMatching(/^[a-z][a-zA-Z]{0,5}$/),
					(containers, inputName) => {
						const code = guardedThroughContainers(containers, inputName);
						try {
							ruleTester.run(
								"probe",
								wrapped as unknown as Parameters<typeof ruleTester.run>[1],
								{ valid: [code], invalid: [] },
							);
						} catch {
							flagged.push(code);
						}
					},
				),
				{ numRuns: 12 },
			);
		} finally {
			RuleTester.describe = previousDescribe;
			RuleTester.it = previousIt;
		}
		expect(flagged).toEqual([]);
	});
});
