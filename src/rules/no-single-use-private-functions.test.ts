import { makeTester, wrap } from "./test-utils.ts";
import { describe, it } from "vitest";

import { noSingleUsePrivateFunctionsRule } from "./no-single-use-private-functions.ts";

const rule = wrap("no-single-use-private-functions", noSingleUsePrivateFunctionsRule);
const tester = makeTester();

tester.run("no-single-use-private-functions", rule, {
	valid: [
		[
			"function usedTwice(n: number) { return n + 1; }",
			"export const sum = usedTwice(1) + usedTwice(2);",
		].join("\n"),
		[
			"export function helper(n: number) { return n; }",
			"export const out = helper(1);",
		].join("\n"),
		[
			"function Used(n: number) { return n; }",
			"const value = Used(1);",
		].join("\n"),
		"type Wide = string | number;\nexport const a: Wide = 1;\nexport const b: Wide = 'x';",
	],
	invalid: [
		{
			code: [
				"function onlyHere(n: number) { return n * 2; }",
				"export const doubled = onlyHere(21);",
			].join("\n"),
			errors: [{ messageId: "singleUseFunction", data: { name: "onlyHere" } }],
		},
		{
			code: [
				"type OnlyHere = { a: 1 };",
				"export const value: OnlyHere = { a: 1 };",
			].join("\n"),
			errors: [{ messageId: "singleUseType", data: { name: "OnlyHere" } }],
		},
		{
			code: [
				"import { Effect } from 'effect';",
				"const prog = Effect.gen(function* () { yield* Effect.succeed(1); });",
				"export const run = prog;",
			].join("\n"),
			errors: [{ messageId: "singleUseEffectProgram", data: { name: "prog" } }],
		},
		{
			code: [
				"import { Effect } from 'effect';",
				"const mk = Effect.fn('Mk')(function* () { yield* Effect.succeed(1); });",
				"export const first = mk();",
			].join("\n"),
			errors: [{ messageId: "singleUseEffectFunction", data: { name: "mk" } }],
		},
	],
});
