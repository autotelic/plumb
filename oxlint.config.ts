import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["node_modules"],
  jsPlugins: [{ name: "plumb-meta", specifier: "./src/meta/index.ts" }],
  rules: {
    "plumb-meta/no-manual-ancestor-walks": "warn",
    "plumb-meta/prefer-before-file-scope": "warn",
    "plumb-meta/require-create-once": "warn",
  },
  overrides: [
    {
      files: ["src/**/*.ts"],
      rules: {
        // rule implementations legitimately use regex tests and helpers
        "unicorn/prefer-string-starts-ends-with": "off",
        "eslint/no-unused-vars": "off",
      },
    },
    // Test-enforcement meta-rules activate as suites land (see scripts/check-rule-tests.mjs).
    {
      files: ["src/**/*.test.ts"],
      rules: {
        "plumb-meta/prefer-property-tests": "error",
        "plumb-meta/require-rule-tester": "error",
      },
    },
  ],
});
