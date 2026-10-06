import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RuleTester } from "oxlint/plugins-dev";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { testableRule, wireRuleTester } from "../../testing/testable-rule.ts";
import { duplicateVerdict, noLocalCopyOfSharedRule } from "./no-local-copy-of-shared.ts";
import { parseManifest } from "../manifest.ts";

import type { UiManifest } from "../manifest.ts";

/** A manifest with one shared component and one local copy of it. */
const CATALOG = JSON.stringify({
	sharedRoots: ["app/components"],
	localRoots: ["app/routes"],
	components: [
		{ path: "app/components/Combobox.tsx", name: "Combobox", tier: "shared", owners: ["a", "b"], props: ["options", "value", "onChange"], tags: ["button", "div"] },
		{ path: "app/routes/p/components/ComboBoxV2.tsx", name: "ComboBoxV2", tier: "local", owners: ["p"], props: ["options", "value", "onChange"], tags: ["button", "div"] },
		{ path: "app/routes/p/components/ProjectBanner.tsx", name: "ProjectBanner", tier: "local", owners: ["p"], props: ["projectId"], tags: ["section"] },
	],
});

const manifestPath = join(mkdtempSync(join(tmpdir(), "plumb-ui-")), "plumb-ui.config.json");
writeFileSync(manifestPath, CATALOG);

wireRuleTester({ describe, it });

new RuleTester().run("no-local-copy-of-shared", testableRule(noLocalCopyOfSharedRule) as never, {
	valid: [
		{
			code: `export const ProjectBanner = () => <section className="p-4" />;`,
			filename: "app/routes/p/components/ProjectBanner.tsx",
			options: [{ manifest: manifestPath }],
		},
		{
			code: `export const Combobox = () => <div className="p-4" />;`,
			filename: "app/components/Combobox.tsx",
			options: [{ manifest: manifestPath }],
		},
		{
			code: `export const Card = () => <div className="p-4" />;`,
			filename: "app/routes/p/components/Card.tsx",
			options: [{ manifest: manifestPath }],
		},
		{
			code: `export const ProjectBanner = () => <section className="p-4" />;`,
			filename: "app/routes/p/components/ProjectBanner.tsx",
		},
		{
			code: `export const ComboBoxV2 = () => <div className="p-4" />;`,
			filename: "app/routes/p/components/ComboBoxV2.tsx",
			options: [{ manifest: manifestPath, threshold: 1.1 }],
		},
	],
	invalid: [
		{
			code: `export const ComboBoxV2 = () => <div className="p-4" />;`,
			filename: "app/routes/p/components/ComboBoxV2.tsx",
			options: [{ manifest: manifestPath }],
			errors: [{ messageId: "localCopyOfShared" }],
		},
	],
});

describe("duplicateVerdict", () => {
	const manifest: UiManifest = parseManifest(CATALOG);

	it("reports a local component that overlaps a shared one above the threshold", () => {
		fc.assert(
			fc.property(fc.integer({ min: 50, max: 100 }), fc.boolean(), (overlapPercent, reversed) => {
				const threshold = overlapPercent / 100;
				const entry = reversed
					? { path: "app/routes/p/components/ComboBoxV2.tsx", name: "ComboBoxV2", tier: "local" as const, owners: ["p"], props: ["options"], tags: [] }
					: { path: "app/routes/p/components/ComboBoxV2.tsx", name: "ComboBoxV2", tier: "local" as const, owners: ["p"], props: ["options", "value", "onChange"], tags: ["button", "div"] };
				const overlap = reversed ? 0.2 : 1;
				const verdict = duplicateVerdict({ entry, manifest, threshold });
				expect(verdict !== null).toBe(threshold <= overlap);
				if (verdict !== null) expect(verdict.shared.path).toBe("app/components/Combobox.tsx");
			}),
		);
	});

	it("never reports a shared component or an uncatalogued file", () => {
		fc.assert(
			fc.property(fc.constantFrom<string>("shared", "local", "primitive"), (tier) => {
				const entry = { path: "app/components/Combobox.tsx", name: "Combobox", tier: tier as "shared", owners: ["a", "b"], props: ["options", "value", "onChange"], tags: ["button", "div"] };
				expect(duplicateVerdict({ entry, manifest, threshold: 0.5 })).toBeNull();
				expect(duplicateVerdict({ entry: null, manifest, threshold: 0.5 })).toBeNull();
			}),
		);
	});
});