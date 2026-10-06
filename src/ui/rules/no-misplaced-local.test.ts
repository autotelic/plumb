import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RuleTester } from "oxlint/plugins-dev";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { testableRule, wireRuleTester } from "../../testing/testable-rule.ts";
import { misplacedVerdict, noMisplacedLocalRule } from "./no-misplaced-local.ts";
import { parseManifest } from "../manifest.ts";

/** A catalog with one stranded single-owner component in shared space. */
const CATALOG = JSON.stringify({
	sharedRoots: ["app/components"],
	localRoots: ["app/routes"],
	components: [
		{ path: "app/components/DataTable.tsx", name: "DataTable", tier: "shared", owners: ["a", "b", "c"] },
		{ path: "app/components/ProjectFilter.tsx", name: "ProjectFilter", tier: "local", owners: ["projects"] },
		{ path: "app/routes/projects/components/ProjectFilter.tsx", name: "ProjectFilter", tier: "local", owners: ["projects"] },
	],
});

const manifestPath = join(mkdtempSync(join(tmpdir(), "plumb-ui-")), "plumb-ui.config.json");
writeFileSync(manifestPath, CATALOG);

wireRuleTester({ describe, it });

new RuleTester().run("no-misplaced-local", testableRule(noMisplacedLocalRule) as never, {
	valid: [
		{
			code: `export const DataTable = () => <div className="p-4" />;`,
			filename: "app/components/DataTable.tsx",
			options: [{ manifest: manifestPath }],
		},
		{
			code: `export const ProjectFilter = () => <div className="p-4" />;`,
			filename: "app/routes/projects/components/ProjectFilter.tsx",
			options: [{ manifest: manifestPath }],
		},
		{
			code: `export const ProjectFilter = () => <div className="p-4" />;`,
			filename: "app/components/ProjectFilter.tsx",
			options: [{ allowPaths: ["app/components"] }],
		},
		{
			code: `export const ProjectFilter = () => <div className="p-4" />;`,
			filename: "app/components/ProjectFilter.tsx",
		},
	],
	invalid: [
		{
			code: `export const ProjectFilter = () => <div className="p-4" />;`,
			filename: "app/components/ProjectFilter.tsx",
			options: [{ manifest: manifestPath }],
			errors: [{ messageId: "misplacedLocal" }],
		},
		{
			code: `export const ProjectFilter = () => <div className="p-4" />;`,
			filename: "app/components/ProjectFilter.tsx",
			options: [{ manifest: manifestPath, localRoots: ["app/features"] }],
			errors: [{ messageId: "misplacedLocal" }],
		},
	],
});

describe("misplacedVerdict", () => {
	const manifest = parseManifest(CATALOG);

	it("proposes a move only for single-owner components in shared space", () => {
		fc.assert(
			fc.property(fc.constantFrom("app/components/ProjectFilter.tsx", "app/routes/projects/components/ProjectFilter.tsx"), (path) => {
				const verdict = misplacedVerdict({ entry: null, manifest, path });
				expect(verdict).toBeNull();
			}),
		);
		const entry = { path: "app/components/ProjectFilter.tsx", name: "ProjectFilter", tier: "local" as const, owners: ["projects"], props: [], tags: [] };
		expect(misplacedVerdict({ entry, manifest, path: "app/components/ProjectFilter.tsx" })?.target).toBe(
			"app/routes/projects/components/ProjectFilter.tsx",
		);
		expect(misplacedVerdict({ entry, manifest, path: "app/routes/projects/components/ProjectFilter.tsx" })).toBeNull();
	});
});