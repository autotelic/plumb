# plumb

Opinionated [Oxlint](https://oxc.rs) rules that keep TypeScript *true* — a plumb line for your codebase.

Extracted from the vendored `anti-slop` plugin in `autotelic/effect-safe-money` (itself derived from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), MIT). This repo is the canonical source of truth for the autotelic repos; consumer repositories vendor a synced copy so rule tweaks stay visible as diffs.

## Plugins

- **`plumb`** — generic rules that reject low-evidence and low-signal implementation patterns (43 rules).
- **`plumb-effect`** — opt-in rules for Effect service and Layer architecture (16 rules). Enable only in repos that depend on `effect`.
- **`plumb/testing`** — RuleTester lifecycle adapter (`testableRule`, `wireRuleTester`, `createTester`) so `createOnce` rules with `before`/`after` hooks test correctly under the ESLint-compatible `create` path.

## Consuming

### 1. Add the dependency (git semver — no registry needed)

```sh
pnpm add -D plumb "github:autotelic/plumb#semver:^0.1.0"
```

### 2a. Direct mode (recommended for most projects)

Point `jsPlugins` straight at the installed package — no copies, updates are just a version bump:

```ts
// oxlint.config.ts
jsPlugins: [
  { name: "plumb", specifier: "./node_modules/plumb/src/index.ts" },
  { name: "plumb-effect", specifier: "./node_modules/plumb/src/effect/index.ts" },
],
rules: {
  "plumb/no-builtin-throws": "error",
  "plumb-effect/guarded-op-must-return-effect": "error",
},
```

### 2b. Vendored + sync mode (for projects that customize rules)

Copy the sources into your repo, then register the local copies:

```sh
node scripts/sync-plumb.mjs        # copies node_modules/plumb/src -> tools/oxlint/plumb
```

```ts
jsPlugins: [
  { name: "plumb", specifier: "./tools/oxlint/plumb/index.ts" },
  { name: "plumb-effect", specifier: "./tools/oxlint/plumb/effect/index.ts" },
],
ignorePatterns: ["tools/oxlint/plumb/**"],
```

Run the sync script with `--check` in CI to fail when the vendored copy drifts from the pinned dependency.

## Updating

```sh
pnpm up plumb                      # bump to latest matching semver tag
git diff                           # review what changed in the vendored copy (sync mode)
```

Releases are cut by tagging this repo (`v0.1.0`, `v0.1.1`, …); git semver resolves tags automatically.

## Development

```sh
pnpm install
pnpm check   # lint + typecheck
```

Cut a release:

```sh
git tag v0.x.y && git push origin v0.x.y
```
