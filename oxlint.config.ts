import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["node_modules"],
  overrides: [
    {
      files: ["src/**/*.ts"],
      rules: {
        // rule implementations legitimately use regex tests and helpers
        "unicorn/prefer-string-starts-ends-with": "off",
        "eslint/no-unused-vars": "off",
      },
    },
  ],
});
