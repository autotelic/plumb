/**
 * Whether a component family (a Provider export plus a useXxx hook export)
 * must carry a dot-notation aggregate export.
 *
 * @param {{ hasProvider: boolean; hasHook: boolean; aggregateOk: boolean }} input - The family's export facts.
 * @returns {boolean} True when an aggregate is required but absent/incomplete.
 */
export declare function familyRequiresAggregate(input: {
    hasProvider: boolean;
    hasHook: boolean;
    aggregateOk: boolean;
}): boolean;
/**
 * A component family (a Provider plus a `useXxx` consumer hook) must be exported
 * through a single dot-notation aggregate (`export const Family = { Provider, ... }`)
 * so consumers compose `Family.Provider` / `Family.Header` and the blocks are
 * discoverable. Bare re-exports of `Provider`/`useXxx` without the aggregate
 * hide the family boundary.
 */
export declare const requireDotNotationExportsRule: import("@oxlint/plugins").Rule;
