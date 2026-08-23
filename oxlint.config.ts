import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["node_modules"],
  jsPlugins: [
    { name: "plumb", specifier: "./src/index.ts" },
    { name: "plumb-meta", specifier: "./src/meta/index.ts" },
  ],
  rules: {
    // plumb — every rule this repo ships, enforced on itself.
    // plumb-effect rules stay consumer-opt-in: plumb is not an Effect application.
    "plumb/no-builtin-throws": "error",
    "plumb/no-boolean-field-signals": "error",
    "plumb/no-barrel-export-star": "error",
    "plumb/no-generic-export-names": "error",
    "plumb/no-swappable-primitive-params": "error",
    "plumb/no-transposed-field-reads": "error",
    "plumb/no-vague-test-filenames": "error",
    "plumb/no-chained-type-assertions": "error",
    "plumb/no-conditional-empty-object-spread": "error",
    "plumb/no-impossible-branch-throw": "error",
    "plumb/no-known-value-widening": "error",
    "plumb/no-module-mocking": "error",
    "plumb/no-object-parameters": "error",
    "plumb/no-product-of-state-booleans": "error",
    "plumb/no-reflect-apply": "error",
    "plumb/no-reflect-get": "error",
    "plumb/no-reinterpret-cast": "error",
    "plumb/no-runtime-typeof": "error",
    "plumb/no-sentinel-comparison-union": "error",
    "plumb/no-stray-inline-comments": "error",
    "plumb/no-tag-ladder-assertions": "error",
    "plumb/no-redundant-derived-field": "error",
    "plumb/no-nondeterministic-core": "error",
    "plumb/no-exported-mutable-state": "error",
    "plumb/no-anonymous-wide-tuples": "error",
    "plumb/no-duplicated-literal-union": "error",
    "plumb/require-canonical-stringify-for-identity": "error",
    "plumb/require-deprecated-tag-for-legacy-comments": "error",
    "plumb/require-sort-comparator": "error",
    "plumb/require-exhaustive-tag-switch": "error",
    "plumb/no-shape-in-symbol-names": "error",
    "plumb/no-unknown-parameters": "error",
    "plumb/no-unknown-returns": "error",
    "plumb/no-unknown-type-aliases": "error",
    "plumb/no-unit-return-validators": "error",
    "plumb/no-unsafe-dictionary-type": "error",
    "plumb/no-widen-then-assert": "error",
    "plumb/no-stacked-jsdoc-blocks": "error",
    "plumb/prefer-payload-brand": "error",
    "plumb/require-fc-block-predicate": "error",
    "plumb/require-jsdoc-on-exported": "error",
    "plumb/require-published-order": "error",
    "plumb/require-safety-comment-for-type-assertion": "error",
    "plumb/prefer-property-tests": "error",
    "plumb-meta/no-manual-ancestor-walks": "error",
    "plumb-meta/prefer-before-file-scope": "error",
    "plumb-meta/require-create-once": "error",
    "plumb-meta/no-disable-directives": "error",
  },
  overrides: [
    // Reflection/decode boundary modules: representation checks and broad
    // parameters are their purpose — they own the crossing between raw
    // AST/config payloads and typed rule logic.
    {
      files: [
        "src/shared/structural.ts",
        "src/shared/rule-options.ts",
        "src/shared/ancestors.ts",
      ],
      rules: {
        // plumb:allow-off — typed bridge over raw payloads; casts JSDoc-documented
        "plumb/no-reinterpret-cast": "off", // plumb:allow-off typed bridge over raw payloads
        "plumb/no-runtime-typeof": "off", // plumb:allow-off decode boundary for config JSON
        "plumb/no-object-parameters": "off", // plumb:allow-off structural reader takes broad node objects
        "plumb/no-unsafe-dictionary-type": "off", // plumb:allow-off record values are the raw payload domain
        "plumb/no-unknown-parameters": "off", // plumb:allow-off reflection input is unknown by definition
        // plumb:allow-off — bridge-module casts carry JSDoc SAFETY notes
        "plumb/no-chained-type-assertions": "off", // plumb:allow-off bridge casts documented in JSDoc
        "plumb/require-safety-comment-for-type-assertion": "off", // plumb:allow-off bridge casts documented in JSDoc
      },
    },
    {
      // Test harnesses adapt plugin objects to RuleTester; the adapter casts
      // are confined to these files and covered by the suites themselves.
      files: ["src/**/*.test.ts"],
      rules: {
        "plumb/no-chained-type-assertions": "off", // plumb:allow-off bridge casts documented in JSDoc
        "plumb/require-safety-comment-for-type-assertion": "off", // plumb:allow-off bridge casts documented in JSDoc
      },
    },
    {
      files: ["src/**/*.ts"],
      rules: {
        // rule implementations legitimately use regex tests and helpers
        "unicorn/prefer-string-starts-ends-with": "off",
        "eslint/no-unused-vars": "off",
      },
    },
    {
      // plumb:allow-off — RuleTester adapter typing requires reinterpretation
      // at the plugin boundary; assertions are confined to these files.
      files: ["src/**/*.test.ts"],
      rules: {
        "plumb/no-reinterpret-cast": "off", // plumb:allow-off typed bridge over raw payloads
        "plumb-meta/require-rule-tester": "error",
      },
    },
  ],
});
