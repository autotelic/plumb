import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

/** Directive and safety comments are tooling contracts, not prose. */
const EXEMPT = /^(?:SAFETY:|eslint|oxlint|@ts-|ts-check|jscpd)/iu;

function childNodes(node: ESTree.Node): Array<ESTree.Node> {
	const children: Array<ESTree.Node> = [];
	for (const key of Object.keys(node)) {
		if (key === "parent" || key === "loc" || key === "range") continue;
		const value = (node as unknown as Record<string, unknown>)[key];
		const candidates = Array.isArray(value) ? value : [value];
		for (const candidate of candidates) {
			if (
				candidate !== null &&
				typeof candidate === "object" &&
				typeof (candidate as ESTree.Node).type === "string"
			) {
				children.push(candidate as ESTree.Node);
			}
		}
	}
	return children;
}

interface CommentLike {
	type: string;
	value: string;
	range?: [number, number];
	loc?: { start?: { line?: number } };
}

/** Stray inline notes inside a function body belong in its JSDoc, not the code. */
export const noStrayInlineCommentsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow // line comments inside function bodies: notes about a function's behaviour belong in that function's JSDoc (description or annotated tags), keeping the body purely executable.",
		},
		messages: {
			strayInlineComment:
				"Stray inline comment inside a function body. Move the note into the enclosing declaration's JSDoc (as description prose or an annotated note) or delete it.",
		},
	},
	createOnce(context) {
		return {
			Program(node) {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return;
				const bodyRanges: Array<[number, number]> = [];
				const visit = (current: ESTree.Node): void => {
					if (
						current.type === "FunctionDeclaration" ||
						current.type === "FunctionExpression" ||
						current.type === "ArrowFunctionExpression"
					) {
						const body = current.body as unknown as { range?: [number, number] } | null;
						if (body?.range !== undefined && body.range !== null) {
							bodyRanges.push(body.range);
						}
					}
					for (const child of childNodes(current)) visit(child);
				};
				visit(node);
				const lineComments = (
					context.sourceCode.getAllComments() as CommentLike[]
				).filter((comment) => comment.type === "Line");
				const exempt = new Set<CommentLike>();
				lineComments.forEach((comment, index) => {
					if (!EXEMPT.test(comment.value.trim())) return;
					exempt.add(comment);
					let previousEnd = (comment.loc as { end?: { line?: number } } | undefined)?.end?.line;
					let cursor = index + 1;
					while (
						previousEnd !== undefined &&
						cursor < lineComments.length
					) {
						const next = lineComments[cursor]!;
						const nextStart = next.loc?.start?.line;
						if (nextStart === undefined || nextStart !== previousEnd + 1) break;
						exempt.add(next);
						previousEnd = (next.loc as { end?: { line?: number } } | undefined)?.end?.line;
						cursor += 1;
					}
				});
				for (const comment of lineComments) {
					if (exempt.has(comment)) continue;
					const start = comment.range?.[0];
					if (start === undefined) continue;
					if (!bodyRanges.some(([from, to]) => start > from && start < to)) continue;
					context.report({
						loc: { start: { line: comment.loc?.start?.line ?? 1, column: 0 } },
						messageId: "strayInlineComment",
					});
				}
			},
		};
	},
});
