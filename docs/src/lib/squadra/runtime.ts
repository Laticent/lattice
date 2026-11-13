// The browser entry, `@laticent/squadra/runtime`: lint and fix with rules the build already proved.
//
// `compileRuleset` (the main entry) proves every rule by running its examples, which means shipping
// the fixtures parser, the example runner and every fixtures file. A host that lints on every
// keystroke (an editor) does that work at build time instead: the build compiles the ruleset
// strictly and records each rule's digest (`digestRuleset`), and this entry loads a rule only when
// its digest matches. It carries no compiler, no fixtures runner and no reporter.
//
// WHAT THE CHECK CATCHES. A rule added, renamed or redeclared after the build ran; a vocabulary,
// language version or budget that changed under it. A rule edited only inside a function body keeps
// its digest (a bundler rewrites function text, so the browser cannot hash it): the build's
// stale-stamp gate, which recompiles every rule against its examples, catches that one before a
// bundle is built from it. Design §8.2 and engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §3.4.

import { editsEngine } from './engine.js';
import { compileCode, isManifest, RESERVED, ruleDigest } from './register.js';
import { type CompiledRule, makeRuleset, type Ruleset } from './ruleset.js';
import type { AnyEngine, AnyLanguage, Problem, RulesetInput, VerifiedStamp } from './types.js';

/** What `loadRuleset` takes: a ruleset's input with no examples, and the digests the build wrote. */
export interface RuntimeInput extends Omit<RulesetInput, 'examples' | 'mode' | 'verified'> {
	/** Rule id → digest, from `digestRuleset` at build time. A rule with no digest, or another one, is refused. */
	readonly verified: VerifiedStamp;
}

/**
 * Load a ruleset the build verified. Never throws for a rule: a rule that fails its own declaration
 * checks, or whose digest does not match, is dropped and reported as `squadra/rule-refused` (code
 * `not-verified` for the digest), as lenient compile reports a refusal.
 */
export function loadRuleset(input: RuntimeInput): Ruleset {
	const problems: Problem[] = [];
	const languages = new Map<string, AnyLanguage>();
	for (const l of input.languages) {
		if (languages.has(l.id)) problems.push({ code: 'duplicate-language', message: `two languages have the id '${l.id}'` });
		languages.set(l.id, l);
	}
	const engines = new Map<string, AnyEngine>([['edits', editsEngine]]);
	for (const e of input.engines ?? []) {
		if (engines.has(e.id)) problems.push({ code: 'duplicate-engine', message: `two engines have the id '${e.id}'` });
		engines.set(e.id, e);
	}
	const vocab = input.vocab ?? {};
	for (const name of Object.keys(vocab)) if (RESERVED.has(name)) problems.push({ code: 'reserved-name', message: `the vocabulary '${name}' has a reserved name` });
	const kept: CompiledRule[] = [];
	const seen = new Set<string>();
	for (const r of input.rules) {
		const id = typeof r.id === 'string' ? r.id : '(no id)';
		const before = problems.length;
		if (seen.has(id)) problems.push({ rule: id, code: 'duplicate-id', message: 'two rules share this id' });
		seen.add(id);
		if (isManifest(r)) {
			problems.push({ rule: id, code: 'not-built', message: 'declarative rule manifests land by M4 (design §2.3)' });
			continue;
		}
		const want = Object.hasOwn(input.verified, id) ? input.verified[id] : undefined;
		if (!want) problems.push({ rule: id, code: 'not-verified', message: 'the build recorded no digest for this rule; rebuild the stamps (`npm run build`)' });
		else if (want !== ruleDigest(input, r)) problems.push({ rule: id, code: 'not-verified', message: 'the rule changed since the build verified it; rebuild the stamps (`npm run build`)' });
		const c = compileCode(r, input, languages, problems);
		if (c && problems.length === before) kept.push(c);
	}
	return makeRuleset({ name: input.name, version: input.version, languages, engines, vocab, order: input.order ?? [], trust: input.trust ?? 'trusted', rules: kept, refused: problems });
}

export { apply, EditError, editsConflict, mapOffset, plan } from './edits.js';
export { type EditOp, type EditsPayload, editsEngine, editsFix } from './engine.js';
export { fix, shapeChanges } from './fix.js';
export { lint } from './lint.js';
export type { Ruleset } from './ruleset.js';
export { isRuleset } from './ruleset.js';
export type * from './types.js';
