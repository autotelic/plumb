/**
 * THE decode boundary for rule options.
 *
 * Rule configuration arrives from the lint config file as untyped JSON; the
 * `typeof` discrimination in this module is that boundary decode, sanctioned
 * by this module's single purpose. No other rule file should inspect option
 * representations directly.
 */
export interface StringLookup {
    readonly [key: string]: string;
}
export interface OptionRecord {
    readonly [key: string]: unknown;
}
/**
 * Read the first options entry as an object record.
 *
 * @param {readonly unknown[] | undefined} options - The raw `context.options` array.
 * @returns {OptionRecord} The first entry as a record, or an empty record when absent.
 */
export declare function firstOptionRecord(options: readonly unknown[] | undefined): OptionRecord;
/**
 * Read a string-array option, ignoring absent entries and non-string members.
 *
 * Rule vocabulary lists (allowlists, banned tags, declared tokens) arrive as
 * untyped JSON; a malformed member narrows to omission rather than to a crash in
 * a lint rule mid-traversal.
 *
 * @param {OptionRecord} record - The decoded options record.
 * @param {string} key - The option key to read.
 * @returns {readonly string[]} The string members, or an empty list when absent.
 */
export declare function stringListOption(record: OptionRecord, key: string): readonly string[];
/**
 * Read a single string option, absent or malformed when it is not a string.
 *
 * @param {OptionRecord} record - The decoded options record.
 * @param {string} key - The option key to read.
 * @returns {string | null} The configured string, or null when absent.
 */
export declare function stringOption(record: OptionRecord, key: string): string | null;
/**
 * Read a finite number option, absent or malformed when it is not a number.
 *
 * @param {OptionRecord} record - The decoded options record.
 * @param {string} key - The option key to read.
 * @returns {number | null} The configured number, or null when absent or non-finite.
 */
export declare function numberOption(record: OptionRecord, key: string): number | null;
/**
 * Read a string-valued record option (a lookup table such as tag replacements).
 *
 * @param {OptionRecord} record - The decoded options record.
 * @param {string} key - The option key to read.
 * @returns {Readonly<Record<string, string>>} The string-valued members, empty when absent.
 */
export declare function stringMapOption(record: OptionRecord, key: string): StringLookup;
