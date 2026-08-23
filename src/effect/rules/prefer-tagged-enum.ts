import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

function hasLiteralTagProperty(member: ESTree.Node): boolean {
	if (member.type !== "TSPropertySignature") return false;
	const key = member.key;
	const isTagKey =
		(key.type === "Identifier" && key.name === "_tag") ||
		(key.type === "Literal" && key.value === "_tag");
	if (!isTagKey) return false;
	const annotation = member.typeAnnotation?.typeAnnotation;
	if (annotation === undefined || annotation === null || annotation.type !== "TSLiteralType") {
		return false;
	}
	return annotation.literal.type === "Literal" && typeof annotation.literal.value === "string";
}

function isTaggedLiteralMember(member: ESTree.TSType): boolean {
	if (member.type !== "TSTypeLiteral") return false;
	return member.members.some(hasLiteralTagProperty);
}

/** Hand-rolled _tag unions duplicate what Data.TaggedEnum gives for free. */
export const preferTaggedEnumRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require internal tagged unions to be declared with Data.TaggedEnum (constructors, $is guards and exhaustive $match) instead of hand-rolled _tag object-literal unions with manual type guards.",
		},
		messages: {
			preferTaggedEnum:
				"This union hand-rolls `_tag` discrimination. Declare it as `type {{name}} = Data.TaggedEnum<{...}>` and derive constructors, `$is` guards and exhaustive `$match` via `Data.taggedEnum<{{name}}>()`, matching the rational.ts idiom.",
		},
	},
	create(context) {
		if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return {};
		return {
			TSTypeAliasDeclaration(node) {
				const annotation = node.typeAnnotation;
				if (annotation.type !== "TSUnionType") return;
				if (annotation.types.length < 2) return;
				if (!annotation.types.every((member) => isTaggedLiteralMember(member))) return;
				context.report({
					node: node.id,
					messageId: "preferTaggedEnum",
					data: { name: node.id.name },
				});
			},
		};
	},
});
