// The driver entry, `@laticent/squadra/driver`: linting and fixing with no rule compiler.
//
// A host that fixes findings from a producer (design §15.4) needs the fix driver, the edit kernel
// and the `edits` engine, and never compiles a rule, prints a diff or applies waivers. A CommonJS
// `require` of a built entry cannot drop what it does not use, so this entry carries only the fix
// path: 6.9 KB min+gzip against 13.3 KB for the main entry (2026-10-29), measured because the
// Studio's lint core has a gzip budget (`lintCoreGz`, docs/route-budget.json). A ruleset with
// rules still comes from `compileRuleset` in the main entry.

import { editsEngine } from './engine.js';
import { makeRuleset, type Ruleset } from './ruleset.js';
import type { AnyEngine, AnyLanguage, Trust } from './types.js';

/** A ruleset with no rules: languages and engines for findings that come from producers. */
export function rulesetOf(opts: {
	readonly name: string;
	readonly version?: string;
	readonly languages: readonly AnyLanguage[];
	readonly engines?: readonly AnyEngine[];
	readonly vocab?: Readonly<Record<string, readonly string[]>>;
	readonly order?: readonly string[];
	readonly trust?: Trust;
}): Ruleset {
	const engines = new Map<string, AnyEngine>([['edits', editsEngine]]);
	for (const e of opts.engines ?? []) {
		if (engines.has(e.id)) throw new Error(`squadra: two engines have the id '${e.id}'`);
		engines.set(e.id, e);
	}
	const languages = new Map<string, AnyLanguage>();
	for (const l of opts.languages) {
		if (languages.has(l.id)) throw new Error(`squadra: two languages have the id '${l.id}'`);
		languages.set(l.id, l);
	}
	return makeRuleset({ name: opts.name, version: opts.version ?? '0', languages, engines, vocab: opts.vocab ?? {}, order: opts.order ?? [], trust: opts.trust ?? 'trusted', rules: [], refused: [] });
}

export { apply, EditError, editsConflict, mapOffset, plan } from './edits.js';
export { type EditOp, type EditsPayload, editsEngine, editsFix } from './engine.js';
export { fix, shapeChanges } from './fix.js';
export type { Ruleset } from './ruleset.js';
export type * from './types.js';
