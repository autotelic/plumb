import { eslintCompatPlugin } from "@oxlint/plugins";

import { noManualAncestorWalksRule } from "./rules/no-manual-ancestor-walks.ts";
import { preferBeforeFileScopeRule } from "./rules/prefer-before-file-scope.ts";
import { preferPropertyTestsRule } from "./rules/prefer-property-tests.ts";
import { requireCreateOnceRule } from "./rules/require-create-once.ts";
import { requireRuleTesterRule } from "./rules/require-rule-tester.ts";

/**
 * Meta-rules that keep rule authorship itself idiomatic (createOnce API, engine-native
 * traversal, RuleTester suites, property-based coverage). Opt-in: only meaningful in
 * lint-plugin codebases, so consumers enable `plumb-meta` deliberately.
 */
const plumbMetaPlugin = eslintCompatPlugin({
	meta: { name: "plumb-meta" },
	rules: {
		"no-manual-ancestor-walks": noManualAncestorWalksRule,
		"prefer-before-file-scope": preferBeforeFileScopeRule,
		"prefer-property-tests": preferPropertyTestsRule,
		"require-create-once": requireCreateOnceRule,
		"require-rule-tester": requireRuleTesterRule,
	},
});

export default plumbMetaPlugin;
