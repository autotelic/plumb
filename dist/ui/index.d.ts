/**
 * Opt-in Oxlint rules for the UI design system's contract: the token set, the
 * primitives, and the tier pipeline. The vocabulary is per-project, so every
 * rule takes its tokens, tag policy, and catalog path from configuration; the
 * rules themselves carry no project knowledge.
 */
declare const plumbUiPlugin: import("@oxlint/plugins").Plugin;
export default plumbUiPlugin;
