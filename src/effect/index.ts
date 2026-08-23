import { eslintCompatPlugin } from "@oxlint/plugins";

import { guardedOpMustReturnEffectRule } from "./rules/guarded-op-must-return-effect.ts";
import { guardedOpMustReturnOptionRule } from "./rules/guarded-op-must-return-option.ts";
import { noDecodeUnknownOptionRule } from "./rules/no-decode-unknown-option.ts";
import { noManualFieldGuardsRule } from "./rules/no-manual-field-guards.ts";
import { noUnguardedJsonParseRule } from "./rules/no-unguarded-json-parse.ts";
import { noSchemaClassModelingRule } from "./rules/no-schema-class-modeling.ts";
import { noServiceConstructorImportsRule } from "./rules/no-service-constructor-imports.ts";
import { optionCoreNeedsEffectPublicRule } from "./rules/option-core-needs-effect-public.ts";
import { preferDieForPreconditionDefectsRule } from "./rules/prefer-die-for-precondition-defects.ts";
import { preferEffectGenForGuardLaddersRule } from "./rules/prefer-effect-gen-for-guard-ladders.ts";
import { preferEffectPredicateOverBooleanFunctionRule } from "./rules/prefer-effect-predicate-over-boolean-function.ts";
import { preferNamedGuardPredicateRule } from "./rules/prefer-named-guard-predicate.ts";
import { preferOrderingMatchRule } from "./rules/prefer-ordering-match.ts";
import { preferOptionPipelineRule } from "./rules/prefer-option-pipeline.ts";
import { preferTaggedEnumRule } from "./rules/prefer-tagged-enum.ts";
import { requireSchemaTypeDerivationRule } from "./rules/require-schema-type-derivation.ts";

/** Opt-in Oxlint rules for Effect service and Layer architecture. */
const plumbEffectPlugin = eslintCompatPlugin({
	meta: { name: "plumb-effect" },
	rules: {
		"guarded-op-must-return-effect": guardedOpMustReturnEffectRule,
		"guarded-op-must-return-option": guardedOpMustReturnOptionRule,
		"no-decode-unknown-option": noDecodeUnknownOptionRule,
		"no-manual-field-guards": noManualFieldGuardsRule,
		"no-unguarded-json-parse": noUnguardedJsonParseRule,
		"option-core-needs-effect-public": optionCoreNeedsEffectPublicRule,
		"no-schema-class-modeling": noSchemaClassModelingRule,
		"no-service-constructor-imports": noServiceConstructorImportsRule,
		"prefer-die-for-precondition-defects": preferDieForPreconditionDefectsRule,
		"prefer-effect-gen-for-guard-ladders": preferEffectGenForGuardLaddersRule,
		"prefer-effect-predicate-over-boolean-function": preferEffectPredicateOverBooleanFunctionRule,
		"prefer-named-guard-predicate": preferNamedGuardPredicateRule,
		"prefer-option-pipeline": preferOptionPipelineRule,
		"prefer-ordering-match": preferOrderingMatchRule,
		"prefer-tagged-enum": preferTaggedEnumRule,
		"require-schema-type-derivation": requireSchemaTypeDerivationRule,
	},
});

export default plumbEffectPlugin;
