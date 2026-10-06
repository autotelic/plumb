import { eslintCompatPlugin } from "@oxlint/plugins";

import { noArbitraryValueRule } from "./rules/no-arbitrary-value.ts";
import { noLocalCopyOfSharedRule } from "./rules/no-local-copy-of-shared.ts";
import { noMisplacedLocalRule } from "./rules/no-misplaced-local.ts";
import { noOffTokenColorRule } from "./rules/no-off-token-color.ts";
import { noRawHtmlLayoutRule } from "./rules/no-raw-html-layout.ts";
import { noRawInteractiveRule } from "./rules/no-raw-interactive.ts";
import { requireCatalogEntryRule } from "./rules/require-catalog-entry.ts";

/**
 * Opt-in Oxlint rules for the UI design system's contract: the token set, the
 * primitives, and the tier pipeline. The vocabulary is per-project, so every
 * rule takes its tokens, tag policy, and catalog path from configuration; the
 * rules themselves carry no project knowledge.
 */
const plumbUiPlugin = eslintCompatPlugin({
	meta: { name: "plumb-ui" },
	rules: {
		"no-off-token-color": noOffTokenColorRule,
		"no-arbitrary-value": noArbitraryValueRule,
		"no-raw-html-layout": noRawHtmlLayoutRule,
		"no-raw-interactive": noRawInteractiveRule,
		"no-local-copy-of-shared": noLocalCopyOfSharedRule,
		"no-misplaced-local": noMisplacedLocalRule,
		"require-catalog-entry": requireCatalogEntryRule,
	},
});

export default plumbUiPlugin;