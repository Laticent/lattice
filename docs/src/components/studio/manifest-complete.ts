// Manifest JSON authoring assist — a schema-aware CodeMirror completion source
// for the Component tab's raw-JSON manifest view. The matching logic is a PURE
// function (testable without CodeMirror); the CM wrapper just maps it onto the
// editor's positions. The vocabulary is the SAME enums the gate validates against
// (layout-core), so completion can only ever suggest a value the gate accepts.

import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { BUCKETS, CSS_ONLY_SUBSTANCES, FORMS, FUNCTIONS } from '@/playground/layout-core.generated.js';
import MANIFEST_SCHEMA from '../../../../lib/components/manifest.schema.json';

// Derived from lib/components/manifest.schema.json, the contract the gate validates against, so a
// key or a value the schema gains is offered without a second edit here. (The hand-listed copy
// had 9 keys of the schema's 55 and omitted `single-orientation` from `adapt.mode`.)
type SchemaProp = { enum?: unknown[]; properties?: Record<string, SchemaProp> };
const SCHEMA_PROPS = (MANIFEST_SCHEMA as { properties: Record<string, SchemaProp> }).properties;
const enumOf = (p?: SchemaProp): string[] | undefined => (Array.isArray(p?.enum) ? (p?.enum as string[]) : undefined);

// The manifest's top-level keys, in schema order (`$schema` is a pointer, not a field to author).
export const MANIFEST_KEYS = Object.keys(SCHEMA_PROPS).filter((k) => !k.startsWith('$'));
// The enum-valued fields → their allowed values. `mode` is `adapt.mode`. `substance` keeps the gate's
// CSS-only subset: the schema also lists substances a generated component may not claim.
export const MANIFEST_ENUMS: Record<string, string[]> = {
	...Object.fromEntries(Object.entries(SCHEMA_PROPS).flatMap(([k, p]) => (enumOf(p) ? [[k, enumOf(p) as string[]]] : []))),
	bucket: BUCKETS as string[],
	function: FUNCTIONS as string[],
	form: FORMS as string[],
	substance: CSS_ONLY_SUBSTANCES as string[],
	mode: enumOf(SCHEMA_PROPS.adapt?.properties?.mode) ?? [],
};

export type ManifestCompletion = { kind: 'key' | 'value'; token: string; options: string[] };

/**
 * Given the text on the current line up to the cursor, decide what to suggest:
 * the enum values when the cursor is inside an enum field's string
 * (`"bucket": "co…`), or the manifest keys when typing a property name
 * (`{ "fu…`). Returns null when neither applies (free-text fields, numbers).
 * Pure + unit-tested.
 */
export function manifestCompletion(before: string): ManifestCompletion | null {
	// value position: inside the quotes of `"<key>": "<partial>`
	const v = before.match(/"(\w+)"\s*:\s*"([^"\n]*)$/);
	if (v) {
		// Object.hasOwn, not a bare lookup: typing `"constructor": "` would
		// otherwise resolve Object.prototype.constructor (a Function) and crash
		// the completion source when it hits .map().
		const opts = Object.hasOwn(MANIFEST_ENUMS, v[1]) ? MANIFEST_ENUMS[v[1]] : undefined;
		return opts ? { kind: 'value', token: v[2], options: opts } : null;
	}
	// key position: a property name being typed at an object boundary
	const k = before.match(/(?:^|[{,])\s*"(\w*)$/);
	if (k) return { kind: 'key', token: k[1], options: MANIFEST_KEYS };
	return null;
}

/** The CodeMirror completion source — maps `manifestCompletion` onto the doc. */
export function manifestJsonCompletion(context: CompletionContext): CompletionResult | null {
	const line = context.state.doc.lineAt(context.pos);
	const before = context.state.sliceDoc(line.from, context.pos);
	const r = manifestCompletion(before);
	if (!r) return null;
	if (!r.token && !context.explicit) return null; // don't pop on every keystroke unless asked
	return {
		from: context.pos - r.token.length,
		options: r.options.map((label) => ({ label, type: r.kind === 'key' ? 'property' : 'enum' })),
		validFor: /^\w*$/,
	};
}
