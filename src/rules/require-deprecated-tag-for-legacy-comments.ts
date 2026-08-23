import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

interface CommentLike {
	type: string;
	value: string;
}

const LEGACY_PROSE =
	/\b(?:deprecat\w*|legacy|obsolete|superseded|do not use|don't use|no longer (?:used?|supported|maintained))\b/iu;

const DEPRECATED_TAG = /@deprecated\b/iu;

/** Legacy warnings written in prose only are invisible to tooling; require the machine-readable tag. */
export const requireDeprecatedTagForLegacyCommentsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require an @deprecated tag whenever a comment describes code as deprecated/legacy/obsolete/do-not-use; prose-only warnings are invisible to editors and agents, who will otherwise discover and use paths you want retired.",
		},
		messages: {
			missingDeprecatedTag:
				"Comment says this code is deprecated/legacy but carries no @deprecated tag; prose warnings are invisible to tooling. Add `@deprecated` (with a pointer to the replacement) so agents and editors see it.",
		},
	},
	createOnce(context) {
		return {
			Program(node) {
				for (const comment of context.sourceCode.getAllComments() as CommentLike[]) {
					if (comment.type !== "Block") continue;
					if (!LEGACY_PROSE.test(comment.value)) continue;
					if (DEPRECATED_TAG.test(comment.value)) continue;
					context.report({
						node,
						messageId: "missingDeprecatedTag",
					});
				}
			},
		};
	},
});
