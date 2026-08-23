import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const COMPARISON_OPERATORS = new Set(["===", "!==", "==", "!=", "<", ">", "<=", ">="]);
const CONSTRUCTOR_NAME = /^(?:make[A-Z]|make$|fromRaw|unsafeMake)/u;

type PredicateFunction = ESTree.ArrowFunctionExpression | ESTree.Function;

type PredicateCandidate = {
	readonly node: PredicateFunction;
	readonly typeName: string;
};

function parameterAnnotation(
	parameter: ESTree.ParamPattern,
): ESTree.TSTypeAnnotation | null | undefined {
	if (parameter.type === "TSParameterProperty") {
		return parameterAnnotation(parameter.parameter);
	}
	if (parameter.type === "RestElement") {
		return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
	}
	if (parameter.type === "AssignmentPattern") {
		return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
	}
	return parameter.typeAnnotation;
}

function referencedTypeName(type: ESTree.TSType): string | null {
	if (type.type === "TSParenthesizedType") return referencedTypeName(type.typeAnnotation);
	if (type.type !== "TSTypeReference" || type.typeName.type !== "Identifier") return null;
	return type.typeName.name;
}

function isLiteralExpression(expression: ESTree.Expression | ESTree.PrivateIdentifier): boolean {
	if (expression.type === "Literal") return true;
	return (
		expression.type === "UnaryExpression" &&
		expression.operator === "-" &&
		expression.argument.type === "Literal"
	);
}

function isParamField(expression: ESTree.Expression | ESTree.PrivateIdentifier, paramName: string): boolean {
	if (expression.type === "PrivateIdentifier") return false;
	if (expression.type !== "MemberExpression" || expression.object.type !== "Identifier") {
		return false;
	}
	if (expression.object.name !== paramName) return false;
	if (expression.computed) return expression.property.type === "Literal";
	return expression.property.type === "Identifier" || expression.property.type === "PrivateIdentifier";
}

function isFieldComparison(expression: ESTree.Expression, paramName: string): boolean {
	if (expression.type !== "BinaryExpression") return false;
	if (!COMPARISON_OPERATORS.has(expression.operator)) return false;
	const fieldOnLeft = isParamField(expression.left, paramName);
	const literalOnRight = isLiteralExpression(expression.right);
	const fieldOnRight = isParamField(expression.right, paramName);
	const literalOnLeft = isLiteralExpression(expression.left);
	return (fieldOnLeft && literalOnRight) || (fieldOnRight && literalOnLeft);
}

function isFieldSignalBody(expression: ESTree.Expression, paramName: string): boolean {
	if (expression.type === "LogicalExpression") {
		return (
			isFieldSignalBody(expression.left, paramName) &&
			isFieldSignalBody(expression.right, paramName)
		);
	}
	if (expression.type === "UnaryExpression" && expression.operator === "!") {
		return isFieldSignalBody(expression.argument, paramName);
	}
	if (expression.type === "ParenthesizedExpression") {
		return isFieldSignalBody(expression.expression, paramName);
	}
	return isFieldComparison(expression, paramName);
}

function predicateBody(node: PredicateFunction): ESTree.Expression | null {
	if (node.body === null || node.body === undefined) return null;
	if (node.body.type === "BlockStatement") {
		if (node.body.body.length !== 1) return null;
		const only = node.body.body[0];
		if (only === undefined) return null;
		if (only.type === "ReturnStatement" && only.argument !== null) return only.argument;
		return null;
	}
	return node.body;
}

function candidateFrom(
	node: PredicateFunction,
): PredicateCandidate | null {
	if (node.returnType === null || node.returnType === undefined) return null;
	const returnType = node.returnType.typeAnnotation;
	if (returnType.type !== "TSBooleanKeyword") return null;
	if (node.params.length !== 1) return null;
	const firstParam = node.params[0];
	if (firstParam === undefined) return null;
	const annotation = parameterAnnotation(firstParam);
	if (annotation === null || annotation === undefined) return null;
	const typeName = referencedTypeName(annotation.typeAnnotation);
	if (typeName === null) return null;
	const body = predicateBody(node);
	if (body === null) return null;
	if (!isFieldSignalBody(body, firstParam.type === "Identifier" ? firstParam.name : "")) {
		return null;
	}
	return { node, typeName };
}

function returnTypeName(node: PredicateFunction): string | null {
	if (node.returnType === null || node.returnType === undefined) return null;
	return referencedTypeName(node.returnType.typeAnnotation);
}

function parameterName(node: PredicateFunction): string | null {
	const parameter = node.params[0];
	if (parameter === null || parameter === undefined) return null;
	if (parameter.type === "Identifier") return parameter.name;
	if (parameter.type === "AssignmentPattern" && parameter.left.type === "Identifier") {
		return parameter.left.name;
	}
	return null;
}

const AUXILIARIES = new Set(["is", "has", "can", "should", "was", "will", "did", "be", "the"]);

/** Split a camelCase/separator name into lowercase tokens, dropping auxiliary prefixes like `is`/`has`. */
function contentTokens(name: string): string[] {
	return name
		.replaceAll(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.split(/[^a-zA-Z0-9]+/u)
		.map((token) => token.toLowerCase())
		.filter((token) => token.length > 0 && !AUXILIARIES.has(token));
}

function propertyName(member: ESTree.TSSignature): string | null {
	if (member.type !== "TSPropertySignature") return null;
	const key = member.key;
	return key.type === "Identifier" ? key.name : null;
}

function isBooleanMember(member: ESTree.TSSignature): boolean {
	if (member.type !== "TSPropertySignature") return false;
	const annotation = member.typeAnnotation;
	return annotation?.typeAnnotation.type === "TSBooleanKeyword";
}

/** Accept both `{ members }` and flattened `{ body }` shapes for an interface/type-literal body. */
function memberList(bodyNode: unknown): ESTree.TSSignature[] {
	if (Array.isArray(bodyNode)) return bodyNode as ESTree.TSSignature[];
	const record = bodyNode as { members?: unknown; body?: unknown } | null;
	if (record === null || typeof record !== "object") return [];
	if (Array.isArray(record.members)) return record.members as ESTree.TSSignature[];
	if (Array.isArray(record.body)) return record.body as ESTree.TSSignature[];
	return [];
}

/** Ban predicate families that re-derive classification, and un-guarded construction. */
export const noBooleanFieldSignalsRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow families of exported predicates over one type that re-test the same fields, constructors that produce un-guarded values, and boolean state products on declared types; classify (parse) once.",
		},
		messages: {
			reportPredicate:
				"Predicates over `{{type}}` each re-derive classification from the same field comparisons. Classify the value once into a named union (or comparable structure) and derive the predicates from it.",
			booleanFieldSignals:
				"Predicates over `{{type}}` each re-derive classification from the same field comparisons. Classify the value once into a named union (or comparable structure) and derive the predicates from it.",
			unguardedConstructor:
				"`{{type}}` is constructed directly by `make` yet inspected by a predicate family. Make the constructor a parser (normalise or return Option) so invalid states can't be produced.",
			booleanStateProduct:
				"`{{name}}` carries {{count}} boolean {{kind}} admitting invalid combinations. Classify once into a named union over that state so impossible combinations can't be represented, and derive any predicates from it.",
		},
	},
	createOnce(context) {
		const pending = new Map<string, PredicateCandidate>();
		const reported = new Set<string>();
		const constructors = new Map<string, ESTree.Function[]>();

		const reportPredicate = (candidate: PredicateCandidate) => {
			context.report({
				node: candidate.node,
				messageId: "booleanFieldSignals",
				data: { type: candidate.typeName },
			});
		};

		const flushConstructors = (typeName: string) => {
			const list = constructors.get(typeName);
			if (list === undefined) return;
			for (const node of list) {
				context.report({ node, messageId: "unguardedConstructor", data: { type: typeName } });
			}
			constructors.delete(typeName);
		};

		const recordPredicate = (candidate: PredicateCandidate | null) => {
			if (candidate === null) return;
			if (reported.has(candidate.typeName)) {
				reportPredicate(candidate);
				return;
			}
			const first = pending.get(candidate.typeName);
			if (first !== undefined) {
				reportPredicate(first);
				reportPredicate(candidate);
				reported.add(candidate.typeName);
				pending.delete(candidate.typeName);
				flushConstructors(candidate.typeName);
				return;
			}
			pending.set(candidate.typeName, candidate);
		};

		const recordConstructor = (typeName: string | null, node: ESTree.Function) => {
			if (typeName === null) return;
			if (reported.has(typeName)) {
				context.report({ node, messageId: "unguardedConstructor", data: { type: typeName } });
				return;
			}
			const list = constructors.get(typeName) ?? [];
			list.push(node);
			constructors.set(typeName, list);
		};

		const checkDeclaredBody = (reportNode: ESTree.Node, members: ESTree.TSSignature[], typeName: string): void => {
			const booleanMembers = members.filter(isBooleanMember);
			const booleanNames = booleanMembers.map(propertyName).filter((name) => name !== null);
			if (booleanNames.length >= 3) {
				context.report({
					node: reportNode,
					messageId: "booleanStateProduct",
					data: { name: typeName, count: String(booleanNames.length), kind: "flags" },
				});
				return;
			}
			for (let i = 0; i < booleanNames.length; i += 1) {
				for (let j = i + 1; j < booleanNames.length; j += 1) {
					const first = contentTokens(booleanNames[i] ?? "");
					const second = contentTokens(booleanNames[j] ?? "");
					const shared = first.find((token) => second.includes(token));
					if (shared === undefined) continue;
					context.report({
						node: reportNode,
						messageId: "booleanStateProduct",
						data: { name: `${booleanNames[i]}/${booleanNames[j]}`, count: "2", kind: `flags over \`${shared}\`` },
					});
					return;
				}
			}
		};

		const handle = (name: string, fn: PredicateFunction, rawNode: ESTree.Node) => {
			if (parameterName(fn) !== null) recordPredicate(candidateFrom(fn));
			const ctorReturn = CONSTRUCTOR_NAME.test(name) ? returnTypeName(fn) : null;
			if (ctorReturn !== null && "id" in fn) recordConstructor(ctorReturn, fn as ESTree.Function);
		};

		return {
			ExportNamedDeclaration(node) {
				const declaration = node.declaration;
				if (declaration === null) return;
				if (declaration.type === "FunctionDeclaration") {
					if (declaration.id !== null) handle(declaration.id.name, declaration, declaration);
					return;
				}
				if (declaration.type !== "VariableDeclaration") return;
				for (const declarator of declaration.declarations) {
					const init = declarator.init;
					if (init === null || init === undefined || init.type !== "ArrowFunctionExpression") continue;
					if (declarator.id.type !== "Identifier") continue;
					handle(declarator.id.name, init, declarator);
				}
			},
			TSInterfaceDeclaration(node) {
				checkDeclaredBody(
					node,
					memberList(node.body),
					node.id.type === "Identifier" ? node.id.name : "anonymous interface",
				);
			},
			TSTypeAliasDeclaration(node) {
				if (node.typeAnnotation.type !== "TSTypeLiteral") return;
				checkDeclaredBody(node, node.typeAnnotation.members, node.id.name);
			},
		};
	},
});
