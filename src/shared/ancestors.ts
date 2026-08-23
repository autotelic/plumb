import type { ESTree, SourceCode } from "@oxlint/plugins";

/**
 * Nearest-first ancestor chain accessor.
 *
 * Oxlint's `sourceCode.getAncestors` returns an internal Node type rather than
 * the exported ESTree union; recover the union once here so rule code can
 * narrow on `type` discriminants without per-site casts.
 *
 * @param {SourceCode} sourceCode - The rule's source-code accessor.
 * @param {ESTree.Node} node - The node whose ancestor chain is requested.
 * @returns {ReadonlyArray<ESTree.Node>} Nearest-first ancestor chain.
 */
export function ancestorsOf(sourceCode: SourceCode, node: ESTree.Node): ReadonlyArray<ESTree.Node> {
	return sourceCode.getAncestors(node) as unknown as ReadonlyArray<ESTree.Node>;
}
