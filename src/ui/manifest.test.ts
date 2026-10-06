import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
	createManifestCache,
	EMPTY_MANIFEST,
	entryAt,
	isUnderSharedRoot,
	loadManifest,
	nearestDuplicate,
	parseManifest,
	relativePathOf,
	signatureOf,
	similarity,
	type CatalogComponent,
} from "./manifest.ts";

function component(overrides: Partial<CatalogComponent> & { readonly path: string }): CatalogComponent {
	return {
		name: "Combo",
		tier: "local",
		owners: ["projects"],
		props: ["options", "value", "onChange"],
		tags: ["button", "div"],
		...overrides,
	};
}

describe("parseManifest", () => {
	it("never throws on arbitrary text and always yields a manifest", () => {
		fc.assert(
			fc.property(fc.string(), (text) => {
				const manifest = parseManifest(text);
				expect(Array.isArray(manifest.colors)).toBe(true);
				expect(Array.isArray(manifest.components)).toBe(true);
			}),
		);
	});

	it("decodes a generated manifest, dropping malformed entries", () => {
		const text = JSON.stringify({
			colors: ["primary", "gray"],
			sharedRoots: ["app/components"],
			localRoots: ["app/routes"],
			components: [
				{ path: "app/components/Combobox.tsx", name: "Combobox", tier: "shared", owners: ["a", "b"], props: ["value"], tags: ["div"] },
				{ path: "app/components/Broken.tsx", name: 7 },
				"nonsense",
			],
		});
		const manifest = parseManifest(text);
		expect(manifest.colors).toEqual(["primary", "gray"]);
		expect(manifest.sharedRoots).toEqual(["app/components"]);
		expect(manifest.components).toHaveLength(1);
		expect(manifest.components[0]?.tier).toBe("shared");
	});
});

describe("relativePathOf", () => {
	it("strips the working directory and normalizes separators", () => {
		expect(
			relativePathOf({ cwd: "/repo/app", filename: "/repo/app/routes/x/Combobox.tsx" }),
		).toBe("routes/x/Combobox.tsx");
		expect(relativePathOf({ cwd: "/repo/", filename: "./app/components/PageCard.tsx" })).toBe(
			"app/components/PageCard.tsx",
		);
	});
});

describe("entryAt", () => {
	it("matches exact paths first and falls back to suffixes", () => {
		const manifest = parseManifest(
			JSON.stringify({
				components: [{ path: "app/components/Combobox.tsx", name: "Combobox", tier: "shared" }],
			}),
		);
		expect(entryAt({ manifest, path: "app/components/Combobox.tsx" })?.tier).toBe("shared");
		expect(entryAt({ manifest, path: "services/ui/app/components/Combobox.tsx" })?.name).toBe("Combobox");
		expect(entryAt({ manifest, path: "app/routes/x/Other.tsx" })).toBeNull();
	});
});

describe("similarity", () => {
	it("is symmetric, bounded, and reflexive for non-empty signatures", () => {
		fc.assert(
			fc.property(
				fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/u), { minLength: 1, maxLength: 6 }),
				fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/u), { minLength: 1, maxLength: 6 }),
				(left, right) => {
					const a = component({ path: "a", props: left, tags: [] });
					const b = component({ path: "b", props: right, tags: [] });
					const score = similarity({ left: a, right: b });
					expect(score).toBe(similarity({ left: b, right: a }));
					expect(score).toBeGreaterThanOrEqual(0);
					expect(score).toBeLessThanOrEqual(1);
					expect(similarity({ left: a, right: a })).toBe(1);
				},
			),
		);
	});

	it("treats empty signatures as unrelated", () => {
		const empty = component({ path: "a", props: [], tags: [] });
		expect(similarity({ left: empty, right: component({ path: "b", props: [], tags: [] }) })).toBe(0);
	});

	it("scores a signature as props plus tags", () => {
		expect(signatureOf(component({ path: "a" })).size).toBe(5);
	});
});

describe("nearestDuplicate", () => {
	it("returns the closest twin in another tier above the threshold", () => {
		const manifest = parseManifest(
			JSON.stringify({
				components: [
					{ path: "app/routes/p/components/ComboBoxV2.tsx", name: "ComboBoxV2", tier: "local", props: ["options", "value", "onChange"], tags: ["button", "div"] },
					{ path: "app/components/Combobox.tsx", name: "Combobox", tier: "shared", props: ["options", "value", "onChange"], tags: ["button", "div"] },
					{ path: "app/components/Table.tsx", name: "Table", tier: "shared", props: ["rows"], tags: ["table"] },
				],
			}),
		);
		const local = entryAt({ manifest, path: "app/routes/p/components/ComboBoxV2.tsx" });
		const match = nearestDuplicate({ manifest, component: local!, threshold: 0.8 });
		expect(match?.component.path).toBe("app/components/Combobox.tsx");
		expect(match?.score).toBe(1);
		expect(nearestDuplicate({ manifest, component: local!, threshold: 1.1 })).toBeNull();
	});
});

describe("isUnderSharedRoot", () => {
	it("claims paths inside shared roots only", () => {
		const manifest = { ...EMPTY_MANIFEST, sharedRoots: ["app/components"] };
		expect(isUnderSharedRoot({ manifest, path: "app/components/PageCard.tsx" })).toBe(true);
		expect(isUnderSharedRoot({ manifest, path: "app/routes/x/Card.tsx" })).toBe(false);
		expect(isUnderSharedRoot({ manifest, path: "app/components-legacy/Card.tsx" })).toBe(false);
	});
});

describe("loadManifest", () => {
	it("reads, decodes, and memoizes the manifest at the configured path", () => {
		const directory = mkdtempSync(join(tmpdir(), "plumb-ui-"));
		const path = join(directory, "plumb-ui.config.json");
		writeFileSync(path, JSON.stringify({ colors: ["primary"] }));
		const cache = createManifestCache();
		const first = loadManifest({ source: { path, cwd: directory }, cache });
		expect(first.colors).toEqual(["primary"]);
		expect(loadManifest({ source: { path, cwd: directory }, cache })).toBe(first);
		expect(loadManifest({ source: { path: "missing.json", cwd: directory }, cache })).toEqual(EMPTY_MANIFEST);
	});
});