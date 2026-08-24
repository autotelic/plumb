# plumb

Opinionated [Oxlint](https://oxc.rs) rules that keep TypeScript *true*: a plumb line for your codebase.

## Plugins

- **`plumb`**: generic rules that reject low-evidence and low-signal implementation patterns (43 rules).
- **`plumb-effect`**: opt-in rules for Effect service and Layer architecture (16 rules). Enable only in repos that depend on `effect`.
- **`plumb/testing`**: RuleTester lifecycle adapter (`testableRule`, `wireRuleTester`, `createTester`) so `createOnce` rules with `before`/`after` hooks test correctly under the ESLint-compatible `create` path.

## Consuming

### 1. Add the dependency (public npm, no tokens or registry config needed)

```sh
pnpm add -D @autotelic/plumb
```

### 2. Register the plugins in your oxlint config

Point `jsPlugins` straight at the installed package: no copies, updates are just a version bump:

```ts
// oxlint.config.ts
jsPlugins: [
  { name: "plumb", specifier: "@autotelic/plumb" },
  { name: "plumb-effect", specifier: "@autotelic/plumb/effect" },
],
rules: {
  "plumb/no-builtin-throws": "error",
  "plumb-effect/guarded-op-must-return-effect": "error",
},
```

If your setup does not resolve package exports for plugin specifiers, point directly at the source files instead:

```ts
jsPlugins: [
  { name: "plumb", specifier: "./node_modules/@autotelic/plumb/src/index.ts" },
  { name: "plumb-effect", specifier: "./node_modules/@autotelic/plumb/src/effect/index.ts" },
],
ignorePatterns: ["node_modules/**"],
```

## Updating

```sh
pnpm up @autotelic/plumb          # bump to the latest published version
```

## Releasing (maintainers)

Releases publish to public npm automatically when a GitHub Release is published; the `Publish` workflow runs `pnpm check`, then publishes with provenance via npm trusted publishing (no stored npm token).

1. Update `version` in `package.json` and merge.
2. Create a GitHub Release for `vX.Y.Z`.
3. The workflow publishes to npmjs; verify on the release page.

## Development

```sh
pnpm install
pnpm check   # lint + typecheck + test + rule/config consistency
```
