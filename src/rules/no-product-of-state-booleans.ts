import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function lastTypeNameSegment(typeName: ESTree.Node): string | null {
	if (typeName.type === "Identifier") return typeName.name;
	if (typeName.type === "TSQualifiedName") return lastTypeNameSegment(typeName.right);
	return null;
}

/**
 * Returns the enclosing TSPropertySignature when the literal is a variant
 * payload of a Data.TaggedEnum (i.e. `{ Variant: Payload }` inside the enum's
 * type argument), otherwise null.
 */
function variantPayloadSignature(node: ESTree.TSTypeLiteral): ESTree.TSPropertySignature | null {
	const annotation = node.parent;
	if (annotation === null || annotation.type !== "TSTypeAnnotation") return null;
	const signature = annotation.parent;
	if (signature === null || signature.type !== "TSPropertySignature") return null;
	const outer = signature.parent;
	if (outer === null || outer.type !== "TSTypeLiteral") return null;
	const args = outer.parent;
	if (args === null) return null;
	const reference = args.parent;
	if (reference === null || reference.type !== "TSTypeReference") return null;
	const name = lastTypeNameSegment(reference.typeName);
	return name !== null && /TaggedEnum$/u.test(name) ? signature : null;
}

function booleanMemberCount(node: ESTree.TSTypeLiteral): number {
	let count = 0;
	for (const member of node.members) {
		if (member.type !== "TSPropertySignature") continue;
		const annotation = member.typeAnnotation;
		if (annotation === null || annotation === undefined) continue;
		if (annotation.typeAnnotation.type === "TSBooleanKeyword") count += 1;
	}
	return count;
}

/** A product of booleans inside a variant tends to admit an illegal combination. */
export const noProductOfStateBooleansRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow tagged-enum variant payloads with two or more boolean state flags; replace them with a nested tag union so impossible combinations can't be represented.",
		},
		messages: {
			productOfStateBooleans:
				"Variant payload `{{name}}` carries {{count}} boolean state flags. Replace them with a nested tag union (e.g. Sign) so combinations like {zero, negative} can't be represented.",
		},
	},
	createOnce(context) {
		return {
			TSTypeLiteral(node) {
				const signature = variantPayloadSignature(node);
				if (signature === null) return;
				const count = booleanMemberCount(node);
				if (count < 2) return;
				const key = signature.key;
				const name = key.type === "Identifier" ? key.name : "variant";
				context.report({
					node,
					messageId: "productOfStateBooleans",
					data: { name, count: String(count) },
				});
			},
		};
	},
});
