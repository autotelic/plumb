/** Top-level privates referenced exactly once are dead indirection; inline them at their single site.
 *
 * A leading JSDoc block marks the name as deliberately documented composition,
 * so such statements are exempt from the check.
 */
export declare const noSingleUsePrivateFunctionsRule: import("@oxlint/plugins").Rule;
