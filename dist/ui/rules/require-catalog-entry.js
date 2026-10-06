import { defineRule } from "@oxlint/plugins";
import { EMPTY_MANIFEST, createManifestCache, entryAt, isDocumented } from "../manifest.js";
import { scopeOf } from "../scope.js";
import { firstOptionRecord, numberOption } from "../../shared/rule-options.js";
/** Owner count at which a component is shared and owes the menu a contract. */
const DEFAULT_MIN_OWNERS = 2;
/** Option key overriding the owner count that requires a documented contract. */
const MIN_OWNERS_OPTION = "minOwners";
/** Option key requiring a documented JSDoc contract. */
const REQUIRE_DOCS_OPTION = "requireDocs";
/** The scope a file carries before its first `before()` hook runs. */
const UNSCOPED = { path: "", isJsx: false, colors: [], manifest: EMPTY_MANIFEST };
/**
 * The shared component whose file must carry a documented contract.
 *
 * @param {{ readonly entry: CatalogComponent | null; readonly minOwners: number }} query - The entry and the owner threshold.
 * @returns {EntryVerdict | null} The component to report, or null when it owes nothing.
 */
export function entryVerdict(query) {
    const entry = query.entry;
    if (entry === null || entry.tier !== "shared")
        return null;
    if (entry.owners.length < query.minOwners)
        return null;
    return { entry, owners: entry.owners };
}
/**
 * A component two routes depend on is a contract, not an implementation detail.
 *
 * The generated menu reads a component's documentation to tell the next agent
 * when to use it and, just as importantly, when not to. A shared component with
 * no documented contract produces a menu entry with no negative space, which is
 * exactly what makes an agent reach for the wrong component: the silence reads
 * as permission.
 */
export const requireCatalogEntryRule = defineRule({
    meta: {
        type: "problem",
        docs: {
            description: "Require a JSDoc contract on shared components with more than one owner; the design-system menu reads it.",
        },
        messages: {
            missingCatalogEntry: "Shared component `{{name}}` has {{count}} owners and no documented contract. Add a JSDoc block stating what it is for and when not to use it; the menu renders that as the component's entry.",
        },
        schema: [
            {
                type: "object",
                properties: {
                    manifest: { type: "string" },
                    minOwners: { type: "number" },
                    requireDocs: { type: "boolean" },
                },
                additionalProperties: false,
            },
        ],
        defaultOptions: [{}],
    },
    createOnce(context) {
        const cache = createManifestCache();
        let scope = UNSCOPED;
        let entry = null;
        let minOwners = DEFAULT_MIN_OWNERS;
        let manifest = EMPTY_MANIFEST;
        let requireDocs = true;
        return {
            before() {
                const options = firstOptionRecord(context.options);
                scope = scopeOf({ cwd: context.cwd, filename: context.filename, options, cache });
                manifest = scope.manifest;
                minOwners = numberOption(options, MIN_OWNERS_OPTION) ?? DEFAULT_MIN_OWNERS;
                requireDocs = options[REQUIRE_DOCS_OPTION] !== false;
                entry = entryAt({ manifest, path: scope.path });
                if (entry === null)
                    return false;
            },
            "Program:exit"(node) {
                if (!requireDocs)
                    return;
                const verdict = entryVerdict({ entry, minOwners });
                if (verdict === null)
                    return;
                if (isDocumented(context.sourceCode))
                    return;
                context.report({
                    node,
                    messageId: "missingCatalogEntry",
                    data: { name: verdict.entry.name, count: String(verdict.owners.length) },
                });
            },
        };
    },
});
