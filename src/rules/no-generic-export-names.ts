import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

/** Single words whose bare grep hits span unrelated subsystems (the `create` problem). */
const GENERIC_TERMS: ReadonlySet<string> = new Set([
	"create",
	"init",
	"initialize",
	"get",
	"set",
	"validate",
	"process",
	"handle",
	"run",
	"make",
	"build",
	"execute",
	"update",
	"parse",
	"format",
	"convert",
	"transform",
	"start",
	"stop",
	"load",
	"save",
	"check",
	"do",
	"main",
	"util",
	"utils",
	"helper",
	"helpers",
	"misc",
	"common",
	"data",
	"manager",
	"service",
	"wrapper",
	"temp",
	"tmp",
]);

const TEST_FILE = /.(?:test|spec).[cm]?[jt]sx?$/u;

function splitWords(name: string): Array<string> {
	return name
		.replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.split(/[^A-Za-z0-9]+/u)
		.filter((word) => word.length > 0);
}

/** Module segment acting as the qualification prefix at qualified call sites. */
function qualifierWords(filename: string): Array<string> {
	const segments = filename.replaceAll("\\", "/").split("/");
	const base = segments[segments.length - 1] ?? "";
	let stem = base.replace(/\.[cm]?[jt]sx?$/u, "");
	if (stem === "index" || stem === "mod") {
		stem = segments[segments.length - 2] ?? stem;
	}
	return splitWords(stem);
}

/** True when every word of the name is generic, so qualification adds nothing either. */
function isAllGeneric(words: Array<string>): boolean {
	return (
		words.length > 0 &&
		words.every((word) => GENERIC_TERMS.has(word.toLowerCase()))
	);
}

interface NamedDeclaration {
	id: ESTree.BindingIdentifier | null;
}

function declaredStatement(statement: ESTree.Statement): ESTree.Node | null {
	return statement.type === "ExportNamedDeclaration" ||
		statement.type === "ExportDefaultDeclaration"
		? (statement.declaration ?? null)
		: statement;
}

function namedIdentifiers(declaration: ESTree.Node): Array<ESTree.BindingIdentifier> {
	if (
		declaration.type === "FunctionDeclaration" ||
		declaration.type === "ClassDeclaration" ||
		declaration.type === "TSInterfaceDeclaration" ||
		declaration.type === "TSTypeAliasDeclaration" ||
		declaration.type === "TSEnumDeclaration"
	) {
		return declaration.id !== null ? [declaration.id] : [];
	}
	if (declaration.type === "VariableDeclaration") {
		return declaration.declarations.flatMap((declarator) =>
			declarator.id.type === "Identifier" ? [declarator.id] : [],
		);
	}
	return [];
}

/** Exported symbols must resolve by grep in one hop; qualification by the module counts. */
export const noGenericExportNamesRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			// Rationale: agents search by text, so a bare generic name lands on hundreds of
			// unrelated hits. A module-qualified token (Currency.make, like Go's pkg.New)
			// is already distinctive, so the module name may supply the missing domain word.
			description:
				"Disallow exported symbol names that stay generic even after module qualification (e.g. utils.ts exporting `create`); a distinctive qualified token such as `Currency.make` greps to exactly the right definition and call sites.",
		},
		messages: {
			genericExportName:
				"Exported symbol `{{qualified}}` stays generic, so searching it lands on hundreds of unrelated hits. Add a domain word to the name (e.g. `create` -> `createStripeClient`) or move it into a domain-named module so callers read `{{domain}}.{{name}}`.",
		},
	},
	createOnce(context) {
		let moduleWords: Array<string> = [];
		let moduleSuppliesDomain = false;
		return {
			before() {
				const filePath = context.filename.replaceAll("\\", "/");
				if (TEST_FILE.test(filePath)) return false;
				moduleWords = qualifierWords(filePath);
				moduleSuppliesDomain = moduleWords.some((word) => !GENERIC_TERMS.has(word.toLowerCase()));
			},
			Program(node) {
				for (const statement of node.body) {
					const declaration = declaredStatement(statement);
					if (declaration === null) continue;
					for (const id of namedIdentifiers(declaration)) {
						const nameWords = splitWords(id.name);
						if (!isAllGeneric(nameWords)) continue;
						if (moduleSuppliesDomain) continue;
						context.report({
							node: id,
							messageId: "genericExportName",
							data: {
								name: id.name,
								qualified: moduleWords.concat(nameWords).join("."),
								domain: moduleWords.join(""),
							},
						});
					}
				}
			},
		};
	},
});
