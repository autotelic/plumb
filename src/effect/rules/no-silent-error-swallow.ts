import { defineRule } from "@oxlint/plugins";

import { cast } from "../../shared/structural.ts";

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$|\/test\//u;

const CATCH_METHODS = new Set([
	"catch",
	"catchTag",
	"catchTags",
	"catchReason",
	"catchReasons",
]);

const VOID_OR_UNIT_METHODS = new Set(["void", "unit"]);

/** Discriminant reader for engine nodes the typings leave loose. */
function typeOf(node: object): string {
	return cast<{ readonly type: string }>(node).type;
}

/** Whether the expression is the bare `Effect.void` / `Effect.unit` member. */
function isEffectVoidOrUnit(node: object | null | undefined): boolean {
	if (node === null || node === undefined) return false;
	if (typeOf(node) !== "MemberExpression") return false;
	const shape = cast<{ readonly object: object; readonly property: object }>(node);
	return (
		typeOf(shape.object) === "Identifier" &&
		cast<{ readonly name: string }>(shape.object).name === "Effect" &&
		typeOf(shape.property) === "Identifier" &&
		VOID_OR_UNIT_METHODS.has(cast<{ readonly name: string }>(shape.property).name)
	);
}

/** A recovery callback that reduces every failure to Effect.void/unit swallows it silently. */
function returnsOnlyVoid(handler: object): boolean {
	const kind = typeOf(handler);
	if (kind !== "ArrowFunctionExpression" && kind !== "FunctionExpression") return false;
	const body = cast<{ readonly body: object }>(handler).body;
	if (isEffectVoidOrUnit(body)) return true;
	if (typeOf(body) !== "BlockStatement") return false;
	const statements = cast<{ readonly body: ReadonlyArray<object> }>(body).body;
	if (statements.length !== 1) return false;
	const statement = statements[0]!;
	if (typeOf(statement) !== "ReturnStatement") return false;
	return isEffectVoidOrUnit(cast<{ readonly argument?: object | null }>(statement).argument ?? null);
}

/** Recovering into Effect.void/Effect.unit erases the failure; recover meaningfully or propagate. */
export const noSilentErrorSwallowRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Effect catch handlers that reduce failures to Effect.void or Effect.unit; recover meaningfully, transform the error, or let it propagate.",
		},
		messages: {
			silentSwallow:
				"This catch handler reduces every failure to `Effect.void`/`Effect.unit`, erasing the error. Recover meaningfully, transform it into a tagged failure, or remove the handler and let the error propagate.",
		},
	},
	createOnce(context) {
		return {
			before() {
				if (TEST_FILE.test(context.filename.replaceAll("\\", "/"))) return false;
			},
			CallExpression(node) {
				const callee = node.callee;
				if (
					callee.type !== "MemberExpression" ||
					callee.computed === true ||
					callee.object.type !== "Identifier" ||
					callee.object.name !== "Effect" ||
					callee.property.type !== "Identifier" ||
					!CATCH_METHODS.has(callee.property.name)
				) {
					return;
				}
				for (const argument of node.arguments) {
					if (returnsOnlyVoid(argument as object)) {
						context.report({ node, messageId: "silentSwallow" });
						return;
					}
					if (typeOf(argument as object) !== "ObjectExpression") continue;
					const properties = cast<{
						readonly properties: ReadonlyArray<object>;
					}>(argument).properties;
					for (const property of properties) {
						const value = cast<{ readonly value?: object }>(property).value;
						if (value !== undefined && returnsOnlyVoid(value)) {
							context.report({ node, messageId: "silentSwallow" });
							return;
						}
					}
				}
			},
		};
	},
});
