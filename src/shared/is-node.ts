import type { ESTree } from "@oxlint/plugins";

import { isRecordObject, type NodeFieldValue, readField, isString } from "./structural.ts";

export function isNode(value: NodeFieldValue): value is ESTree.Node {
	return isRecordObject(value) && isString(readField(value, "type"));
}
