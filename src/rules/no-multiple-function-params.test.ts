import { makeTester, wrap } from "./test-utils.ts";
import { describe, it } from "vitest";

import { noMultipleFunctionParamsRule } from "./no-multiple-function-params.ts";

const rule = wrap("no-multiple-function-params", noMultipleFunctionParamsRule);
const tester = makeTester();

tester.run("no-multiple-function-params", rule, {
	valid: [
		"function handle(request: HandleRequest) {}",
		"const convert = (rate: Rate) => rate.value;",
		"export async function GET(request: Request) {}",
		{
			code: "export function POST(a: Request, b: Context) {}",
			filename: "app/users/route.ts",
		},
		{
			code: "[1, 2].map((value: number, index: number) => `${index}:${value}`);",
			filename: "src/client.ts",
		},
	],
	invalid: [
		{
			code: "function handle(userId: string, orderId: string) {}",
			errors: [{ messageId: "multipleParams" }],
		},
		{
			code: "const render = (a: string, b: number, c: boolean) => `${a}${b}${c}`;",
			errors: [{ messageId: "multipleParams" }],
		},
		{
			code: "function PUT(a: Request, b: Response) {}",
			filename: "app/users/route.ts",
			errors: [{ messageId: "multipleParams" }],
		},
		{
			code: "export function POST(a: Request, b: Context) {}",
			filename: "app/handlers/create.ts",
			errors: [{ messageId: "multipleParams" }],
		},
	],
});
