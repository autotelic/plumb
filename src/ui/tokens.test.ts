import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	arbitraryValueOf,
	colorFamilyOf,
	isAllowlisted,
	isArbitraryColor,
	isOffTokenFamily,
	splitClassNames,
	utilityOf,
	DEFAULT_OFF_TOKEN_FAMILIES,
} from "./tokens.ts";

describe("splitClassNames", () => {
	it("keeps order and drops whitespace-only fragments", () => {
		expect(splitClassNames("  flex   gap-2\n  p-4 ")).toEqual(["flex", "gap-2", "p-4"]);
	});

	it("reconstructs the token set under any whitespace", () => {
		fc.assert(
			fc.property(fc.array(fc.constantFrom("flex", "gap-2", "bg-primary-600"), { maxLength: 6 }), (tokens) => {
				const joined = tokens.join(" ");
				expect(splitClassNames(joined)).toEqual(tokens);
			}),
		);
	});
});

describe("utilityOf", () => {
	it("drops variant, important, and negative markers", () => {
		expect(utilityOf("hover:bg-primary-600")).toBe("bg-primary-600");
		expect(utilityOf("dark:md:hover:-mt-4")).toBe("mt-4");
		expect(utilityOf("!p-4")).toBe("p-4");
	});

	it("keeps colons inside arbitrary values", () => {
		expect(utilityOf("data-[state=open]:bg-primary")).toBe("bg-primary");
	});

	it("is idempotent", () => {
		fc.assert(
			fc.property(fc.string(), (token) => {
				expect(utilityOf(utilityOf(token))).toBe(utilityOf(token));
			}),
		);
	});
});

describe("colorFamilyOf", () => {
	it("names the family behind a shade and an opacity modifier", () => {
		expect(colorFamilyOf("bg-gray-500")).toBe("gray");
		expect(colorFamilyOf("text-primary-600")).toBe("primary");
		expect(colorFamilyOf("border-danger-500/50")).toBe("danger");
	});

	it("returns null for utilities that name no color", () => {
		expect(colorFamilyOf("flex")).toBeNull();
		expect(colorFamilyOf("p-4")).toBeNull();
		expect(colorFamilyOf("bg-none")).toBe("none");
	});

	it("agrees with the declared off-token palette", () => {
		fc.assert(
			fc.property(fc.constantFrom(...DEFAULT_OFF_TOKEN_FAMILIES), fc.integer({ min: 50, max: 900 }), (family, shade) => {
				const shadeString = String(shade);
				expect(colorFamilyOf(`text-${family}-${shadeString}`)).toBe(family);
				expect(isOffTokenFamily({ family, allowed: [] })).toBe(true);
			}),
		);
	});
});

describe("arbitraryValueOf", () => {
	it("reads bracketed and parenthesized literals", () => {
		expect(arbitraryValueOf("p-[17px]")).toBe("17px");
		expect(arbitraryValueOf("bg-[#fff]")).toBe("#fff");
		expect(arbitraryValueOf("w-[calc(100%-1rem)]")).toBe("calc(100%-1rem)");
		expect(arbitraryValueOf("bg-(--brand)")).toBe("--brand");
	});

	it("returns null when nothing is arbitrary", () => {
		expect(arbitraryValueOf("p-4")).toBeNull();
	});

	it("recognizes color literals but not sizing literals", () => {
		expect(isArbitraryColor("bg-[#fff]")).toBe(true);
		expect(isArbitraryColor("text-[rgb(0,0,0)]")).toBe(true);
		expect(isArbitraryColor("w-[17px]")).toBe(false);
	});
});

describe("isAllowlisted", () => {
	it("claims exact subjects and prefix patterns", () => {
		expect(isAllowlisted({ subject: "data-[state=open]:bg-primary", patterns: ["data-["] })).toBe(true);
		expect(isAllowlisted({ subject: "p-4", patterns: ["p-4"] })).toBe(true);
		expect(isAllowlisted({ subject: "p-5", patterns: ["p-4"] })).toBe(false);
		expect(isAllowlisted({ subject: "p-5", patterns: [] })).toBe(false);
	});
});

describe("isOffTokenFamily", () => {
	it("accepts declared and neutral families only", () => {
		expect(isOffTokenFamily({ family: "primary", allowed: ["primary"] })).toBe(false);
		expect(isOffTokenFamily({ family: "white", allowed: [] })).toBe(false);
		expect(isOffTokenFamily({ family: "gray", allowed: ["primary"] })).toBe(true);
	});
});
