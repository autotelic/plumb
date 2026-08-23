import { makeTester, wrap } from "./test-utils.ts";
import { describe, it } from "vitest";

import { noOptionalFunctionParametersRule } from "./no-optional-function-parameters.ts";

const rule = wrap("no-optional-function-parameters", noOptionalFunctionParametersRule);
const tester = makeTester();

tester.run("no-optional-function-parameters", rule, {
	valid: [
		"function greet(name: string | undefined) {}",
		"const parse = (raw: string | undefined) => raw ?? '';",
		"function retry(input: string, suffix = 'x') {}",
	],
	invalid: [
		{
			code: "function greet(name?: string) {}",
			errors: [{ messageId: "optionalParameter" }],
		},
		{
			code: "const load = (id?: number) => id;",
			errors: [{ messageId: "optionalParameter" }],
		},
		{
			code: "class Box { constructor(private readonly seed?: number) {} }",
			errors: [{ messageId: "optionalParameter" }],
		},
	],
});
