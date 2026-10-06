import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAllComments, isRecordObject, isString, readField } from "../shared/structural.ts";

import type { SourceCode } from "@oxlint/plugins";
import type { NodeFieldValue } from "../shared/structural.ts";

/*
 * The generated UI catalog, as the `plumb-ui` tier rules consume it.
 *
 * `tools/ui-catalog` crawls the app tree and writes this manifest: token
 * families, tier roots, and one entry per component with its owners and
 * signature. The rules never re-derive that graph; they read it, so the
 * expensive analysis stays in one generator and a lint run stays a lookup.
 */

/** Where a component sits in the tier pipeline. */
export type CatalogTier = "primitive" | "shared" | "local";

/** One component as the catalog classified it. */
export interface CatalogComponent {
	readonly path: string;
	readonly name: string;
	readonly tier: CatalogTier;
	readonly owners: readonly string[];
	readonly props: readonly string[];
	readonly tags: readonly string[];
}

/** The whole manifest: token vocabulary, tier roots, and the component graph. */
export interface UiManifest {
	readonly colors: readonly string[];
	readonly sharedRoots: readonly string[];
	readonly localRoots: readonly string[];
	readonly components: readonly CatalogComponent[];
}

/** A manifest for projects that generate no catalog: every tier rule stays silent. */
export const EMPTY_MANIFEST: UiManifest = {
	colors: [],
	sharedRoots: [],
	localRoots: [],
	components: [],
};

/** Two components compared for near-duplication. */
export interface DuplicatePair {
	readonly left: CatalogComponent;
	readonly right: CatalogComponent;
}

/** A manifest file to resolve, memoized through the session's cache. */
export interface ManifestQuery {
	readonly source: ManifestSource;
	readonly cache: ManifestCache;
}

/** A manifest file's path and the working directory to resolve it against. */
export interface ManifestSource {
	readonly path: string;
	readonly cwd: string;
}

/** Per-session manifest cache, owned by the rule that reads the manifest. */
export interface ManifestCache {
	readonly entries: Map<string, UiManifest>;
}

/** The subject component, the manifest to search, and the score threshold. */
export interface DuplicateQuery {
	readonly manifest: UiManifest;
	readonly component: CatalogComponent;
	readonly threshold: number;
}

/** The nearest higher-tier twin of a component. */
export interface DuplicateMatch {
	readonly component: CatalogComponent;
	readonly score: number;
}

/** A linting file's location, reduced to what catalog matching needs. */
export interface FileLocation {
	readonly cwd: string;
	readonly filename: string;
}

/** A file path looked up in a manifest. */
export interface PathLookup {
	readonly manifest: UiManifest;
	readonly path: string;
}

/**
 * Create the per-session manifest cache a rule holds in its own closure.
 *
 * @returns {ManifestCache} An empty cache.
 */
export function createManifestCache(): ManifestCache {
	return { entries: new Map<string, UiManifest>() };
}

/**
 * Whether a decoded value names one of the manifest's tiers.
 *
 * @param {NodeFieldValue} value - The decoded `tier` field.
 * @returns {boolean} True when the value names a tier.
 */
function isTier(value: NodeFieldValue): value is CatalogTier {
	return value === "primitive" || value === "shared" || value === "local";
}

/**
 * The string members of a decoded array field, absent when malformed.
 *
 * @param {NodeFieldValue} value - The decoded field.
 * @returns {readonly string[]} The string members, or an empty list.
 */
function readStringList(value: NodeFieldValue): readonly string[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isString);
}

/**
 * One catalog entry, or null when the decoded object lacks the required fields.
 *
 * @param {NodeFieldValue} value - The decoded component entry.
 * @returns {CatalogComponent | null} The entry, or null when it is unusable.
 */
function readComponent(value: NodeFieldValue): CatalogComponent | null {
	if (!isRecordObject(value)) return null;
	const path = readField(value, "path");
	const name = readField(value, "name");
	const tier = readField(value, "tier");
	if (!isString(path) || !isString(name) || !isTier(tier)) return null;
	return {
		path,
		name,
		tier,
		owners: readStringList(readField(value, "owners")),
		props: readStringList(readField(value, "props")),
		tags: readStringList(readField(value, "tags")),
	};
}

/**
 * Parse a JSON document without letting a malformed manifest crash a lint run.
 *
 * @param {string} text - The manifest's JSON text.
 * @returns {NodeFieldValue} The parsed document, or null when the text is not JSON.
 */
function decodeJson(text: string): NodeFieldValue {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * Decode a manifest document. Malformed input decodes to the empty manifest, so
 * a stale or hand-edited catalog degrades to silence rather than false findings.
 *
 * @param {string} text - The manifest's JSON text.
 * @returns {UiManifest} The decoded manifest, empty when the text is unusable.
 */
export function parseManifest(text: string): UiManifest {
	const decoded = decodeJson(text);
	if (!isRecordObject(decoded)) return EMPTY_MANIFEST;
	const entries: CatalogComponent[] = [];
	const rawComponents = readField(decoded, "components");
	if (Array.isArray(rawComponents)) {
		for (const entry of rawComponents) {
			const component = readComponent(entry);
			if (component !== null) entries.push(component);
		}
	}
	return {
		colors: readStringList(readField(decoded, "colors")),
		sharedRoots: readStringList(readField(decoded, "sharedRoots")),
		localRoots: readStringList(readField(decoded, "localRoots")),
		components: entries,
	};
}

/**
 * Read and decode the manifest at a path, memoized per resolved path.
 *
 * @param {ManifestQuery} query - The manifest path, the working directory, and the session cache.
 * @returns {UiManifest} The decoded manifest, empty when the file is absent or unreadable.
 */
export function loadManifest(query: ManifestQuery): UiManifest {
	const resolved = resolve(query.source.cwd, query.source.path);
	const cached = query.cache.entries.get(resolved);
	if (cached !== undefined) return cached;
	let text = "";
	try {
		text = readFileSync(resolved, "utf8");
	} catch {
		text = "";
	}
	const manifest = parseManifest(text);
	query.cache.entries.set(resolved, manifest);
	return manifest;
}

/**
 * Reduce a path to the repository-relative, forward-slashed form the catalog uses.
 *
 * @param {FileLocation} location - The linting working directory and the linted filename.
 * @returns {string} The normalized repository-relative path.
 */
export function relativePathOf(location: FileLocation): string {
	const file = location.filename.replaceAll("\\", "/");
	const root = location.cwd.replaceAll("\\", "/").replace(/\/$/u, "");
	const relative = file.startsWith(root) ? file.slice(root.length) : file;
	return relative.replace(/^\.\//u, "").replace(/^\/+/u, "");
}

/**
 * The catalog entry describing a file, matched by exact path then by suffix.
 *
 * @param {PathLookup} lookup - The manifest and the normalized file path.
 * @returns {CatalogComponent | null} The entry, or null when the file is not in the catalog.
 */
export function entryAt(lookup: PathLookup): CatalogComponent | null {
	for (const component of lookup.manifest.components) {
		if (component.path === lookup.path) return component;
	}
	for (const component of lookup.manifest.components) {
		if (lookup.path.endsWith(`/${component.path}`) || component.path.endsWith(`/${lookup.path}`)) return component;
	}
	return null;
}

/**
 * Whether a path lives under one of the manifest's shared roots.
 *
 * @param {PathLookup} lookup - The manifest and the normalized file path.
 * @returns {boolean} True when the path sits in shared-component territory.
 */
export function isUnderSharedRoot(lookup: PathLookup): boolean {
	return lookup.manifest.sharedRoots.some(
		(root) => lookup.path === root || lookup.path.startsWith(`${root}/`),
	);
}

/**
 * The comparable surface of a component: its prop names plus its rendered tags.
 *
 * @param {CatalogComponent} component - The catalog entry.
 * @returns {ReadonlySet<string>} The normalized signature.
 */
export function signatureOf(component: CatalogComponent): ReadonlySet<string> {
	return new Set([...component.props, ...component.tags]);
}

/**
 * Jaccard overlap of two component signatures.
 *
 * @param {DuplicatePair} pair - The components compared.
 * @returns {number} The overlap in [0, 1]; two empty signatures are not similar.
 */
export function similarity(pair: DuplicatePair): number {
	const left = signatureOf(pair.left);
	const right = signatureOf(pair.right);
	if (left.size === 0 || right.size === 0) return 0;
	let shared = 0;
	for (const member of left) if (right.has(member)) shared += 1;
	return shared / (left.size + right.size - shared);
}

/**
 * The nearest twin of a component in another tier, at or above the threshold.
 *
 * @param {DuplicateQuery} query - The manifest, the subject component, and the score threshold.
 * @returns {DuplicateMatch | null} The closest twin, or null when nothing is close enough.
 */
export function nearestDuplicate(query: DuplicateQuery): DuplicateMatch | null {
	let best: DuplicateMatch | null = null;
	for (const candidate of query.manifest.components) {
		if (candidate.path === query.component.path) continue;
		if (candidate.tier === query.component.tier) continue;
		const score = similarity({ left: query.component, right: candidate });
		if (score < query.threshold) continue;
		if (best === null || score > best.score) best = { component: candidate, score };
	}
	return best;
}

/**
 * Whether a module carries a documentation block for the catalog to read.
 *
 * @param {SourceCode} sourceCode - The rule's source-code accessor.
 * @returns {boolean} True when at least one JSDoc block is present.
 */
export function isDocumented(sourceCode: SourceCode): boolean {
	return getAllComments(sourceCode).some(
		(comment) => comment.type === "Block" && comment.value.startsWith("*"),
	);
}