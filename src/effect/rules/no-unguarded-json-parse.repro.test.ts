import { describe, expect, it } from "vitest";

import { RuleTester } from "oxlint/plugins-dev";

import { noUnguardedJsonParseRule } from "./no-unguarded-json-parse.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

describe("corpus regression", () => {
	it("Effect.gen + yield* Effect.try({ try: () => JSON.parse }) is guarded", () => {
		const cases = [
			// Direct: thunk handed straight to Effect.try
			`const x = (input: string): Effect.Effect<number, Error> =>
				Effect.try({
					try: () => JSON.parse(input),
					catch: (e) => new Error(String(e)),
				});`,
			// Corpus shape: thunk inside Effect.gen via yield*
			`const x = (input: string): Effect.Effect<number, Error> =>
				Effect.gen(function* () {
					const parsed: unknown = yield* Effect.try({
						try: () => JSON.parse(input),
						catch: (e) => new Error(String(e)),
					});
					return parsed;
				});`,
		];
		for (const code of cases) {
			let threw = false;
			try {
				ruleTester.run("no-unguarded-json-parse", noUnguardedJsonParseRule, { valid: [code], invalid: [] });
			} catch {
				threw = true;
			}
			expect(threw, `rule flagged guarded parse:\n${code}`).toBe(false);
		}
	});
});
