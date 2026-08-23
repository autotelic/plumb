import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function propertyName(node: { readonly computed: boolean; readonly key: unknown }): string | null {
	if (node.computed) return null;
	// `Property` visitors receive Object/Binding/AssignmentTarget properties; all share this shape.
	const key = node.key as { type?: string; name?: string; value?: unknown };
	if (key?.type === "Identifier") return key.name ?? null;
	if (key?.type === "Literal" && typeof key.value === "string") return key.value;
	return null;
}

/** File-scoping logic belongs in the `before` hook, not scattered through visitors or `create`. */
export const preferBeforeFileScopeRule = defineRule({
	meta: {
		type: "suggestion",
		docs: {
			description: "Read `context.filename` only inside a `before` hook; skip the file by returning `false` there.",
		},
		messages: {
			moveToBefore:
				"File-scoping read of `context.filename` outside `before()`. Do file selection in `before()` and return `false` to skip the file, keeping visitors free of filename checks.",
		},
	},
	createOnce(context) {
		let insideBeforeHook = false;
		return {
			Property(node) {
				if (!insideBeforeHook && propertyName(node) === "before") insideBeforeHook = true;
			},
			"Property:exit"(node) {
				if (insideBeforeHook && propertyName(node) === "before") insideBeforeHook = false;
			},
			MemberExpression(node) {
				if (insideBeforeHook) return;
				if (node.computed) return;
				if (node.object.type !== "Identifier" || node.object.name !== "context") return;
				if (node.property.type !== "Identifier" || node.property.name !== "filename") return;
				context.report({ node, messageId: "moveToBefore" });
			},
		};
	},
});
