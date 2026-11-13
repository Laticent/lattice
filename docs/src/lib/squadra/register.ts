// Rule registration (design §8.1) and the verified stamp (design §8.2): everything about a rule that
// can be checked WITHOUT running its examples. The compiler (compile.ts) adds the example run on top;
// the browser runtime (runtime.ts) adds the stamp check instead, so it ships neither the fixtures
// parser nor the example runner.

import { type CompiledRule, type Dispatch, factOf } from './ruleset.js';
import { parseSelector, SelectorError, selectorKinds } from './select.js';
import type { AnyLanguage, CodeRule, Problem, RuleManifest, RulesetInput, Severity, VerifiedStamp } from './types.js';

const SEVERITIES = new Set<Severity>(['error', 'warning', 'suggestion', 'info']);
export const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const DEFAULT_FINDINGS = 1000;

export function isManifest(r: CodeRule | RuleManifest): r is RuleManifest {
	return (r as RuleManifest).format !== undefined;
}

/** Check a code rule's own declaration and build its dispatch table. Problems are pushed, not thrown. */
export function compileCode(r: CodeRule, input: Pick<RulesetInput, 'name' | 'vocab' | 'defaults'>, languages: Map<string, AnyLanguage>, problems: Problem[]): CompiledRule | null {
	const id = r.id;
	const p = (code: string, message: string, at?: string) => problems.push({ rule: id, code, message, ...(at ? { at } : {}) });
	if (typeof id !== 'string' || !id.startsWith(`${input.name}/`) || !/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(id)) {
		p('bad-id', `a rule id is '${input.name}/<lower-case-name>'`);
	}
	if (!SEVERITIES.has(r.severity)) p('bad-rule', `severity '${String(r.severity)}' is not error, warning, suggestion or info`);
	if (typeof r.summary !== 'string' || !r.summary.trim()) p('bad-rule', 'a rule needs a one-line summary');
	if (!r.visit && !r.check) p('bad-rule', 'a code rule needs `visit` or `check`');
	const lang = languages.get(r.language);
	if (!lang) p('unknown-language', `no language '${r.language}' in the ruleset`);
	const budget = r.budget ?? input.defaults?.budget;
	if (!budget) p('no-budget', 'the rule declares no budget and the ruleset sets no default');
	else if (!(budget.ops > 0) || (budget.findings !== undefined && !(budget.findings > 0))) p('no-budget', 'a budget needs positive `ops` (and `findings`, if set)');
	for (const name of [...(r.reads?.facts ?? []), ...(r.reads?.vocab ?? [])]) if (RESERVED.has(name)) p('reserved-name', `'${name}' is a reserved name`);
	for (const name of r.reads?.vocab ?? []) if (!RESERVED.has(name) && !(input.vocab && Object.hasOwn(input.vocab, name))) p('unknown-vocab', `the rule reads the vocabulary '${name}', which the ruleset does not supply`);
	if (lang) for (const name of r.reads?.facts ?? []) if (!RESERVED.has(name) && !factOf(lang, name)) p('unknown-fact', `the rule reads the fact '${name}', which ${lang.id} does not supply`);
	for (const ch of r.changes ?? []) {
		if (!['slide-count', 'front-matter', 'inert'].includes(ch.kind) || !ch.reason?.trim()) p('bad-rule', `a declared shape change needs a kind (slide-count, front-matter, inert) and a reason`);
	}
	const visits: Dispatch[] = [];
	for (const [selector, handler] of Object.entries(r.visit ?? {})) {
		try {
			const list = parseSelector(selector);
			if (lang) for (const k of selectorKinds(list)) if (!lang.kinds.includes(k)) p('unknown-kind', `the selector names '${k}', which ${lang.id} does not publish`, `visit['${selector}']`);
			visits.push({ list, handler });
		} catch (e) {
			if (e instanceof SelectorError) p('bad-selector', e.message, `visit['${selector}'] at ${e.position}`);
			else throw e;
		}
	}
	if (!lang || !budget) return null;
	return {
		id,
		rule: r,
		severity: r.severity,
		budget: { ops: budget.ops, findings: budget.findings ?? DEFAULT_FINDINGS },
		visits,
		facts: new Set(r.reads?.facts ?? []),
		vocab: new Set(r.reads?.vocab ?? []),
		inert: r.inert === 'include',
		changes: new Set((r.changes ?? []).map((c) => c.kind)),
	};
}

// ── The verified stamp (design §8.2) ────────────────────────────────────────
//
// A build computes a stamp per rule; a host that passes it skips the example run for every rule
// whose stamp still matches. The hash covers the rule (its functions by their source text), its
// fixtures, the vocabulary it reads and its language's id and version. It cannot see modules a
// code rule imports: the build that writes the stamp must re-stamp when those change, which a
// stamp built from the bundled module does.

/** A stamp for every code rule in the input. */
export function stampRuleset(input: RulesetInput): VerifiedStamp {
	const out: Record<string, string> = {};
	for (const r of input.rules) {
		if (isManifest(r)) continue;
		const s = stampRule(input, r);
		if (s) out[r.id] = s;
	}
	return out;
}

/** The rule's stamp, or '' when its source cannot be read (a bound or native function prints as
 *  `[native code]`, so two different rules would share a stamp): such a rule is never skipped. */
export function stampRule(input: RulesetInput, r: CodeRule): string {
	let opaque = false;
	const body = JSON.stringify(r, (_k, v) => {
		if (v instanceof RegExp) return `re:${String(v)}`;
		if (v instanceof Set || v instanceof Map) return [...v];
		if (typeof v !== 'function') return v;
		const src = String(v);
		if (/\[native code\]\s*\}$/.test(src)) opaque = true;
		return `fn:${src}`;
	});
	if (opaque) return '';
	const lang = input.languages.find((l) => l.id === r.language);
	const vocab = (r.reads?.vocab ?? []).map((v) => `${v}=${(input.vocab?.[v] ?? []).join('\u0001')}`).join('\u0002');
	// What the example run depends on beyond the rule: the budget it runs under and every engine its
	// fixes may lower through.
	const budget = JSON.stringify(r.budget ?? input.defaults?.budget ?? null);
	const engines = (input.engines ?? []).map((e) => `${e.id}:${String(e.toEdits)}`).join('\u0001');
	return hash([body, input.examples?.[r.examples] ?? '', vocab, lang ? `${lang.id}@${lang.version}` : '', budget, engines].join('\u0003'));
}

// ── The runtime digest ──────────────────────────────────────────────────────
//
// The stamp above reads a rule's functions by their source text, and a bundler rewrites that text
// (minifies, renames, inlines), so a browser cannot recompute a stamp the build wrote in Node. The
// DIGEST is the part of a rule a bundler leaves alone: its declaration (id, severity, summary,
// language, selectors, reads, budget, fixable, changes, inert, examples path), the vocabulary it
// reads, its language's id and version and the engines by id. `@laticent/squadra/runtime` loads a
// rule only when its digest matches the one the build recorded beside its stamp. A rule edited
// inside a function body keeps its digest: the build's stale-stamp check (which recompiles every
// rule against its examples) is what catches that, before the browser ever sees it.

/** The bundler-stable digest of a rule, or '' for a declarative manifest. */
export function ruleDigest(input: Pick<RulesetInput, 'languages' | 'vocab' | 'defaults' | 'engines'>, r: CodeRule | RuleManifest): string {
	if (isManifest(r)) return '';
	// A RegExp or a Set stringifies as `{}`, so it is spelled out: a pattern edit changes the digest.
	const body = JSON.stringify(r, (_k, v) => (typeof v === 'function' ? 'fn' : v instanceof RegExp ? `re:${String(v)}` : v instanceof Set || v instanceof Map ? [...v] : v));
	const lang = input.languages.find((l) => l.id === r.language);
	const vocab = (r.reads?.vocab ?? []).map((v) => `${v}=${(input.vocab?.[v] ?? []).join('\u0001')}`).join('\u0002');
	const budget = JSON.stringify(r.budget ?? input.defaults?.budget ?? null);
	const engines = (input.engines ?? []).map((e) => e.id).join('\u0001');
	return hash([body, vocab, lang ? `${lang.id}@${lang.version}` : '', budget, engines].join('\u0003'));
}

/** A digest for every code rule in the input: what `loadRuleset` checks. */
export function digestRuleset(input: Pick<RulesetInput, 'languages' | 'vocab' | 'defaults' | 'engines' | 'rules'>): VerifiedStamp {
	const out: Record<string, string> = {};
	for (const r of input.rules) {
		const d = ruleDigest(input, r);
		if (d) out[r.id] = d;
	}
	return out;
}

/** Two 32-bit FNV-1a hashes with different seeds: 16 hex digits, enough to tell edits apart. */
function hash(s: string): string {
	let a = 0x811c9dc5;
	let b = 0x01000193 ^ 0x5bd1e995;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		a = Math.imul(a ^ c, 0x01000193);
		b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
	}
	return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
