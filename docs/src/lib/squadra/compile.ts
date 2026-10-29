// The rule compiler and its refusals (design §8). Segno refuses a grammar it cannot prove linear;
// Squadra refuses a rule it cannot show works on its own examples. Every problem in every rule is
// collected. Strict mode throws one RulesetError listing them all; lenient mode drops each refused
// rule, keeps the rest, and `lint` reports every refusal as `squadra/rule-refused`.
//
// What the examples prove: the rule is alive (it fires where its bad examples say), precise (at the
// marked spans), quiet (on its good examples), and its fix converges and keeps the document's
// shape. What they do not prove: that the rule is right on inputs its author did not write.

import { editsEngine } from './engine.js';
import { fix } from './fix.js';
import { type Example, parseFixtures } from './fixtures.js';
import { inInert, parseSource, runRules } from './lint.js';
import { type CompiledRule, type Dispatch, factOf, makeRuleset, type Ruleset } from './ruleset.js';
import { matches, parseSelector, SelectorError, selectorKinds } from './select.js';
import type { AnyEngine, AnyLanguage, CodeRule, Node, Problem, RuleManifest, RulesetInput, Severity, Span, VerifiedStamp } from './types.js';

const BRAND: unique symbol = Symbol.for('@laticent/squadra/RulesetError');

export class RulesetError extends Error {
	readonly problems: readonly Problem[];
	readonly [BRAND] = true;
	constructor(problems: readonly Problem[]) {
		super(`squadra: ${problems.length} problem${problems.length === 1 ? '' : 's'} in the ruleset:\n${problems.map((p) => `  ${p.rule ? `${p.rule}: ` : ''}[${p.code}] ${p.message}${p.at ? ` (${p.at})` : ''}`).join('\n')}`);
		this.name = 'RulesetError';
		this.problems = problems;
	}
	/** True for a RulesetError from any copy of the library. */
	static is(x: unknown): x is RulesetError {
		return typeof x === 'object' && x !== null && (x as Record<symbol, unknown>)[BRAND] === true;
	}
}

const SEVERITIES = new Set<Severity>(['error', 'warning', 'suggestion', 'info']);
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const DEFAULT_FINDINGS = 1000;

/** Compile and verify a ruleset. Strict (the default) throws a RulesetError listing every problem. */
export function compileRuleset(input: RulesetInput): Ruleset {
	const { ruleset, problems } = build(input);
	if ((input.mode ?? 'strict') === 'strict' && problems.length) throw new RulesetError(problems);
	return ruleset;
}

/** The same list of problems, without throwing (like Segno's lint). */
export function checkRuleset(input: RulesetInput): Problem[] {
	return build(input).problems;
}

function isManifest(r: CodeRule | RuleManifest): r is RuleManifest {
	return (r as RuleManifest).format !== undefined;
}

function build(input: RulesetInput): { ruleset: Ruleset; problems: Problem[] } {
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
	const examples = input.examples ?? {};
	const base = { name: input.name, version: input.version, languages, engines, vocab, order: input.order ?? [], trust: input.trust ?? ('trusted' as const) };

	const seen = new Set<string>();
	const compiled: CompiledRule[] = [];
	const refused = new Set<string>();
	for (const r of input.rules) {
		const id = typeof r.id === 'string' ? r.id : '(no id)';
		const before = problems.length;
		if (seen.has(id)) problems.push({ rule: id, code: 'duplicate-id', message: 'two rules share this id' });
		seen.add(id);
		if (isManifest(r)) {
			problems.push({ rule: id, code: 'not-built', message: 'declarative rule manifests run on the selector language, which lands by M4 (design §2.3); write a code rule until then' });
		} else if ((r as { scope?: unknown }).scope !== undefined || (r as { collect?: unknown }).collect !== undefined) {
			problems.push({ rule: id, code: 'not-built', message: 'project rules (collect and decide) land in M3 (design §2.3)' });
		} else {
			const c = compileCode(r, input, languages, problems);
			if (c && problems.length === before) compiled.push(c);
		}
		if (problems.length > before) refused.add(id);
	}

	// The example checks run last, each rule alone, against everything the ruleset supplies.
	for (const c of [...compiled]) {
		if (input.verified?.[c.id] && input.verified[c.id] === stampRule(input, c.rule)) continue;
		const before = problems.length;
		checkExamples(c, base, examples, problems);
		if (problems.length > before) refused.add(c.id);
	}

	const kept = compiled.filter((c) => !refused.has(c.id));
	// A problem with the ruleset itself (two languages with one id) names no rule; lenient mode still
	// reports it, as every refusal is (design §4).
	const refusals = problems.filter((p) => !p.rule || refused.has(p.rule));
	return { ruleset: makeRuleset({ ...base, rules: kept, refused: refusals }), problems };
}

function compileCode(r: CodeRule, input: RulesetInput, languages: Map<string, AnyLanguage>, problems: Problem[]): CompiledRule | null {
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

type Base = Pick<Ruleset, 'name' | 'version' | 'languages' | 'engines' | 'vocab' | 'order' | 'trust'>;

function checkExamples(c: CompiledRule, base: Base, examples: Readonly<Record<string, string>>, problems: Problem[]): void {
	const id = c.id;
	const path = c.rule.examples;
	const p = (code: string, message: string, at?: string) => problems.push({ rule: id, code, message, ...(at ? { at } : {}) });
	const text = typeof path === 'string' ? examples[path] : undefined;
	if (text === undefined) {
		p('no-examples', `the fixtures file '${String(path)}' is not in the ruleset's examples`);
		return;
	}
	const fx = parseFixtures(text);
	for (const e of fx.errors) p('bad-fixtures', e.message, `${path}:${e.line}`);
	if (fx.errors.length) return;
	const bad = fx.examples.filter((e) => e.role === 'bad');
	const good = fx.examples.filter((e) => e.role === 'good');
	if (!bad.length || !good.length) {
		p('no-examples', `the rule needs at least one bad and one good example; ${path} has ${bad.length} bad and ${good.length} good`);
		return;
	}
	const single = makeRuleset({ ...base, rules: [c], refused: [] });
	const sourceOf = (e: Example) => ({ path: `${path}#${e.name}`, text: e.text, language: c.rule.language });
	const ownProblems = (findings: readonly { rule: string; message: string }[], at: string) => {
		for (const f of findings) {
			if (f.rule === 'squadra/undeclared-read') p('undeclared-read', f.message, at);
			else if (f.rule === 'squadra/rule-threw') p('rule-threw', f.message, at);
			else if (f.rule === 'squadra/budget-exceeded') p('budget-exceeded', `${f.message} A rule must run its own examples within its budget.`, at);
			else if (f.rule === 'squadra/findings-capped') p('budget-exceeded', f.message, at);
			else if (f.rule === 'squadra/undeclared-fix') p('undeclared-fix', f.message, at);
		}
	};

	// A rule declares `fixable`, so a fix that appears only on inputs its examples do not cover still
	// owes a `fixed` example (red team, 2026-10-29).
	const hasFix = !!c.rule.fixable;
	let fixSeen = false;
	for (const e of bad) {
		const at = `${path}#${e.name}`;
		const parsed = parseSource(single, sourceOf(e));
		const all = runRules(single, parsed, [c]).findings;
		ownProblems(all, at);
		const mine = all.filter((f) => f.rule === id);
		if (mine.some((f) => f.fixes.length)) fixSeen = true;
		if (!mine.length) {
			p('bad-did-not-fire', 'the bad example produced no finding from the rule', at);
			continue;
		}
		if (e.spans.length) {
			const want = spanList(e.spans);
			const got = spanList(mine.map((f) => f.span));
			if (want !== got) p('bad-did-not-fire', `the rule reported at ${got || 'nothing'}; the example marks ${want}`, at);
		}
		if (e.count !== undefined && mine.length !== e.count) p('bad-did-not-fire', `the rule reported ${mine.length} findings; the example says x${e.count}`, at);
	}
	for (const e of good) {
		const at = `${path}#${e.name}`;
		const all = runRules(single, parseSource(single, sourceOf(e)), [c]).findings;
		ownProblems(all, at);
		const mine = all.filter((f) => f.rule === id);
		if (mine.length) p('good-fired', `the good example produced ${mine.length} finding${mine.length === 1 ? '' : 's'}: ${mine[0].message}`, at);
	}
	// At least one good example must hold a node the rule visits, so the rule's own test, not the
	// node's absence, is what keeps it quiet. A `check` rule reads the whole file and has no selector.
	if (c.visits.length) {
		const reaches = good.some((e) => {
			const parsed = parseSource(single, sourceOf(e));
			const up = parsed.up();
			let hit = false;
			const walk = (n: Node) => {
				for (const k of n.kids) {
					if (hit) return;
					if ((c.inert || !inInert(parsed.inert, k)) && c.visits.some((d) => d.list.some((cx) => matches(k, cx, parsed.root, up)))) hit = true;
					walk(k);
				}
			};
			walk(parsed.root);
			return hit;
		});
		if (!reaches) p('good-avoids-selector', 'no good example contains a node the rule visits, so nothing shows its test works');
	}
	if (!hasFix) {
		if (fx.examples.some((e) => e.role === 'fixed')) p('fix-mismatch', 'the fixtures have a fixed example, but the rule does not declare `fixable: true`');
		return;
	}
	if (!fixSeen) p('fix-mismatch', 'the rule declares `fixable: true`, but no bad example produced a fix');
	for (const e of bad) {
		const at = `${path}#${e.name}`;
		const fixed = fx.examples.find((x) => x.role === 'fixed' && x.pairs === e.name);
		if (!fixed) {
			p('fix-missing-fixed', 'the rule has a fix, and this bad example has no fixed partner', at);
			continue;
		}
		const res = fix(single, sourceOf(e), { safety: 'unsafe', only: [id] });
		for (const s of res.skipped) {
			if (s.reason === 'broke-structure') p('fix-changed-shape', 'a fix changed the example\'s shape (units, header or inert text) without the rule declaring it in `changes`', at);
			else if (s.reason === 'did-not-resolve') p('fix-did-not-resolve', 'after its fix, the rule still reported the same finding', at);
			else if (s.reason === 'cycle' || s.reason === 'max-passes') p('fix-grew', `the fix did not converge (${s.reason})`, at);
			else if (s.reason !== 'conflict') p('fix-mismatch', `a fix could not apply: ${s.reason}${s.detail ? ` (${s.detail})` : ''}`, at);
		}
		const growth = new Map<number, number>();
		for (const a of res.applied) growth.set(a.pass, (growth.get(a.pass) ?? 0) + a.edits.reduce((n, x) => n + x.text.length - (x.to - x.from), 0));
		if ([...growth.values()].filter((n) => n > 0).length > 1) p('fix-grew', 'the driver inserted text in more than one pass', at);
		if (res.remaining.some((f) => f.rule === id)) p('fix-did-not-resolve', 'the rule still fires on the fixed text', at);
		if (res.text !== fixed.text) p('fix-mismatch', `the fix produced ${JSON.stringify(clip(res.text))}; the fixed example is ${JSON.stringify(clip(fixed.text))}`, at);
	}
}

function spanList(spans: readonly Span[]): string {
	return [...spans]
		.sort((a, b) => a.from - b.from || a.to - b.to)
		.map((s) => `${s.from}-${s.to}`)
		.join(', ');
}

function clip(s: string): string {
	return s.length > 120 ? `${s.slice(0, 117)}...` : s;
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
