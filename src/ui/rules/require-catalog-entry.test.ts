import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RuleTester } from "oxlint/plugins-dev";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { testableRule, wireRuleTester } from "../../testing/testable-rule.ts";
import { entryVerdict, requireCatalogEntryRule } from "./require-catalog-entry.ts";

/** A catalog with one widely-used shared component and one single-owner local. */
const CATALOG = JSON.stringify({
	sharedRoots: ["app/components"],
	localRoots: ["app/routes"],
	components: [
		{ path: "app/components/DataTable.tsx", name: "DataTable", tier: "shared", owners: ["a", "b", "c"] },
		{ path: "app/routes/a/components/AWidget.tsx", name: "AWidget", tier: "local", owners: ["a"] },
	],
});

const manifestPath = join(mkdtempSync(join(tmpdir(), "plumb-ui-")), "plumb-ui.config.json");
writeFileSync(manifestPath, CATALOG);

wireRuleTester({ describe, it });

new RuleTester().run("require-catalog-entry", testableRule(requireCatalogEntryRule) as never, {
	valid: [
		{
			code: `/** Record list with selection and export. Not for static key/value display. */
export const DataTable = () => <div className="p-4" />;`,
			filename: "app/components/DataTable.tsx",
			options: [{ manifest: manifestPath }],
		},
		{
			code: `export const AWidget = () => <div className="p-4" />;`,
			filename: "app/routes/a/components/AWidget.tsx",
			options: [{ manifest: manifestPath }],
		},
		{
			code: `export const DataTable = () => <div className="p-4" />;`,
			filename: "app/components/DataTable.tsx",
			options: [{ manifest: manifestPath, requireDocs: false }],
		},
		{
			code: `export const DataTable = () => <div className="p-4" />;`,
			filename: "app/components/DataTable.tsx",
			options: [{ manifest: manifestPath, minOwners: 5 }],
		},
		{
			code: `export const DataTable = () => <div className="p-4" />;`,
			filename: "app/components/DataTable.tsx",
		},
	],
	invalid: [
		{
			code: `export const DataTable = () => <div className="p-4" />;`,
			filename: "app/components/DataTable.tsx",
			options: [{ manifest: manifestPath }],
			errors: [{ messageId: "missingCatalogEntry" }],
		},
	],
});

describe("entryVerdict", () => {
	it("requires the configured number of owners on a shared component", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 4 }), fc.boolean(), (ownerCount, shared) => {
				const entry = {
					path: "app/components/DataTable.tsx",
					name: "DataTable",
					tier: shared ? ("shared" as const) : ("local" as const),
					owners: Array.from({ length: ownerCount }, (_unused, index) => `route${index}`),
					props: [],
					tags: [],
				};
				const verdict = entryVerdict({ entry, minOwners: 2 });
				expect(verdict !== null).toBe(shared && ownerCount >= 2);
			}),
		);
	});
});