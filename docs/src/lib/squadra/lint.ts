// The lint driver (design §4, §6.5, §8.3): parse each source once, walk its tree once, dispatch
// each node to every rule that visits its kind, and give each rule a context whose every call
// counts against the rule's op budget. A rule that throws, overruns its budget or floods findings
// is stopped on that file and reported; the other rules still run.

import { checkGroup, EditError } from './edits.js';
import { type CompiledRule, factOf, type Ruleset, SAFETY_RANK, SEVERITY_RANK } from './ruleset.js';
import { type Complex, type MatchMemo, matches, matchMemo, parents, parseSelector, select as selectNodes } from './select.js';
import type { AnyLanguage, EngineContext, Finding, Fix, LintOptions, LintResult, LoweredFix, Node, Position, ProducedFinding, Producer, ReportInput, RuleContext, Severity, Shape, Source, Span } from './types.js';
import { applyWaivers } from './waivers.js';

/** One source, parsed once, with everything rules and the fix driver read from it. */
export interface Parsed {
	readonly source: Source;
	readonly lang: AnyLanguage | null;
	readonly tree: unknown;
	readonly root: Node;
	readonly inert: readonly Span[];
	readonly errors: readonly { readonly span: Span; readonly message: string }[];
	readonly header: Span | null;
	shape(): Shape;
	up(): Map<Node, Node>;
	position(offset: number): Position;
}

const EMPTY_ROOT: Node = Object.freeze({ kind: 'root', from: 0, to: 0, kids: [] });

export function parseSource(rules: Ruleset, source: Source): Parsed {
	const lang = rules.languages.get(source.language) ?? null;
	let tree: unknown = EMPTY_ROOT;
	let root: Node = EMPTY_ROOT;
	let inert: readonly Span[] = [];
	const errors: { span: Span; message: string }[] = [];
	if (!lang) errors.push({ span: { from: 0, to: 0 }, message: `no language '${source.language}' in ruleset '${rules.name}'` });
	else {
		try {
			const out = lang.parse(source);
			tree = out.tree;
			root = lang.root ? lang.root(out.tree) : (out.tree as Node);
			errors.push(...out.errors);
			inert = lang.inert ? [...lang.inert(out.tree, source)].sort((a, b) => a.from - b.from) : [];
		} catch (e) {
			// A parser that cannot produce any tree: the parse error, at `error`, is the finding, so an
			// unreadable file can never pass a gate silently (design §5.2).
			errors.push({ span: { from: 0, to: 0 }, message: `the ${lang.id} parser threw: ${(e as Error)?.message ?? e}` });
			tree = EMPTY_ROOT;
			root = EMPTY_ROOT;
		}
	}
	let shape: Shape | undefined;
	let up: Map<Node, Node> | undefined;
	let lineStarts: number[] | undefined;
	const shapeOf = (): Shape => {
		if (!shape) shape = lang ? lang.shape(tree, source) : { units: 0, header: null, inert: [] };
		return shape;
	};
	return {
		source,
		lang,
		tree,
		root,
		inert,
		errors,
		get header() {
			return shapeOf().header ?? null;
		},
		shape: shapeOf,
		up() {
			if (!up) up = parents(root);
			return up;
		},
		position(offset: number): Position {
			if (!lineStarts) {
				lineStarts = [0];
				const t = source.text;
				for (let i = t.indexOf('\n'); i >= 0; i = t.indexOf('\n', i + 1)) lineStarts.push(i + 1);
			}
			let lo = 0;
			let hi = lineStarts.length - 1;
			while (lo < hi) {
				const mid = (lo + hi + 1) >> 1;
				if (lineStarts[mid] <= offset) lo = mid;
				else hi = mid - 1;
			}
			return { line: lo + 1, column: offset - lineStarts[lo] + 1 };
		},
	};
}

/** Is `span` wholly inside one inert range? `inert` is sorted. */
export function inInert(inert: readonly Span[], span: Span): boolean {
	for (const r of inert) {
		if (r.from > span.from) return false;
		if (span.from < r.to && span.to <= r.to) return true;
	}
	return false;
}

/** Does an edit touch an inert range? A replacement touches it if the two overlap; an insertion
 *  touches it only strictly inside, so text inserted at a fence's edge is allowed. */
export function touchesInert(inert: readonly Span[], e: Span): boolean {
	for (const r of inert) {
		if (e.from === e.to) {
			if (r.from >= e.from) return false;
			if (e.from < r.to) return true;
		} else {
			if (r.from >= e.to) return false;
			if (e.from < r.to) return true;
		}
	}
	return false;
}

class Stop extends Error {}

function mask(text: string, span: Span, inert: readonly Span[]): string {
	let out = text.slice(span.from, span.to);
	for (const r of inert) {
		if (r.to <= span.from || r.from >= span.to) continue;
		const a = Math.max(r.from, span.from) - span.from;
		const b = Math.min(r.to, span.to) - span.from;
		out = out.slice(0, a) + out.slice(a, b).replace(/[^\n]/g, ' ') + out.slice(b);
	}
	return out;
}

function now(): number {
	const p = (globalThis as { performance?: { now(): number } }).performance;
	return p ? p.now() : Date.now();
}

export interface RawRun {
	readonly findings: Finding[];
	readonly perRule: Record<string, { ms: number; ops: number }>;
}

/** Squadra's own finding, at the given span. */
export function ownFinding(p: Parsed | null, path: string, rule: string, severity: Severity, message: string, span: Span = { from: 0, to: 0 }, data: Record<string, unknown> = {}): Finding {
	const start = p ? p.position(span.from) : { line: 1, column: 1 };
	const end = p ? p.position(span.to) : { line: 1, column: 1 };
	return { rule, severity, path, span, start, end, message, fixes: [], data };
}

/** Lower a fix to edits against the current text (design §7.2). Never throws. */
export function lowerFix(rules: Ruleset, parsed: Parsed, fix: Fix, finding: { rule: string; span: Span; message: string }): LoweredFix {
	let safety = fix.safety;
	if (rules.trust === 'untrusted' && SAFETY_RANK[safety] < SAFETY_RANK.suggested) safety = 'suggested';
	const base = { engine: fix.engine, safety, description: fix.description };
	const engine = rules.engines.get(fix.engine);
	if (!engine) return { ...base, edits: null, skip: 'engine-missing', detail: `no engine '${fix.engine}'` };
	const ctx: EngineContext = {
		tree: parsed.root,
		finding,
		vocab: rules.vocab,
		header: parsed.header,
		text: (s) => parsed.source.text.slice(s.from, s.to),
	};
	let out: ReturnType<typeof engine.toEdits>;
	try {
		out = engine.toEdits(parsed.source, fix, ctx);
	} catch (e) {
		return { ...base, edits: null, skip: 'engine-threw', detail: String((e as Error)?.message ?? e) };
	}
	if (out === null) return { ...base, edits: null, skip: 'stale' };
	if (!Array.isArray(out)) {
		const s = out as { skip: LoweredFix['skip']; detail?: string };
		return { ...base, edits: null, skip: s.skip, detail: s.detail };
	}
	try {
		checkGroup({ id: finding.rule, edits: out }, parsed.source.text.length);
	} catch (e) {
		if (e instanceof EditError) return { ...base, edits: null, skip: 'invalid-edit', detail: e.message };
		throw e;
	}
	return { ...base, edits: out.map((e) => ({ from: e.from, to: e.to, text: e.text })) };
}

/** Run `rules` (already filtered) over one parsed source. No waivers, no severity filter. */
export function runRules(ruleset: Ruleset, parsed: Parsed, rules: readonly CompiledRule[], opts: LintOptions = {}): RawRun {
	const { source } = parsed;
	const findings: Finding[] = [];
	const perRule: Record<string, { ms: number; ops: number }> = {};
	for (const e of parsed.errors) findings.push(ownFinding(parsed, source.path, 'squadra/parse-error', 'error', e.message, e.span));
	if (!parsed.lang) return { findings, perRule };
	const lang = parsed.lang;
	const selectors = new Map<string, readonly Complex[]>();
	const factMemo = new Map<string, Map<Node, unknown>>();

	interface State {
		readonly c: CompiledRule;
		/** Sticky: once a rule passes its budget or cap it stays stopped on this file, even if it
		 *  catches the signal the driver throws (red team, 2026-10-29). */
		stop: 'budget' | 'capped' | null;
		ops: number;
		count: number;
		ms: number;
		dead: boolean;
		undeclared: Set<string>;
		ctx: RuleContext;
	}
	const states: State[] = rules.map((c) => {
		const st: State = { c, stop: null, ops: 0, count: 0, ms: 0, dead: false, undeclared: new Set(), ctx: null as unknown as RuleContext };
		const tick = () => {
			if (st.stop) throw new Stop(st.stop);
			if (++st.ops > c.budget.ops) {
				st.stop = 'budget';
				throw new Stop('budget');
			}
		};
		const undeclared = (what: 'fact' | 'vocabulary', name: string) => {
			const key = `${what}:${name}`;
			if (st.undeclared.has(key)) return;
			st.undeclared.add(key);
			findings.push(ownFinding(parsed, source.path, 'squadra/undeclared-read', 'error', `${c.id} read the ${what} '${name}' without declaring it in reads.`, { from: 0, to: 0 }, { rule: c.id, [what]: name }));
		};
		st.ctx = {
			text(span) {
				tick();
				return c.inert ? source.text.slice(span.from, span.to) : mask(source.text, span, parsed.inert);
			},
			raw(span) {
				tick();
				return source.text.slice(span.from, span.to);
			},
			select(from, selector) {
				tick();
				let list = selectors.get(selector);
				if (!list) {
					list = parseSelector(selector);
					selectors.set(selector, list);
				}
				const hits = selectNodes(from, list, parsed.up(), tick);
				return c.inert ? hits : hits.filter((n) => !inInert(parsed.inert, n));
			},
			fact<T>(name: string, node?: Node): T | undefined {
				tick();
				if (!c.facts.has(name)) {
					undeclared('fact', name);
					return undefined;
				}
				const f = factOf(lang, name);
				if (!f) return undefined;
				let memo = factMemo.get(name);
				if (!memo) factMemo.set(name, (memo = new Map()));
				const key = node ?? parsed.root;
				if (!memo.has(key)) memo.set(key, f(parsed.tree, source, node));
				return memo.get(key) as T;
			},
			vocab(name) {
				tick();
				if (!c.vocab.has(name)) {
					undeclared('vocabulary', name);
					return [];
				}
				return ruleset.vocab[name] ?? [];
			},
			measurement<T>(name: string, node?: Node): T | undefined {
				tick();
				const m = opts.measurements?.[name];
				return (typeof m === 'function' ? (m as (n?: Node) => unknown)(node) : m) as T | undefined;
			},
			report(input: ReportInput) {
				tick();
				const span = input.span;
				if (!(span && Number.isInteger(span.from) && Number.isInteger(span.to) && span.from >= 0 && span.from <= span.to && span.to <= source.text.length)) {
					throw new RangeError(`reported a span outside the text: ${JSON.stringify(span)}`);
				}
				if (st.count >= c.budget.findings) {
					st.stop = 'capped';
					throw new Stop('capped');
				}
				st.count++;
				const severity = input.severity ?? c.severity;
				const id = { rule: c.id, span, message: input.message };
				findings.push({
					rule: c.id,
					...(c.rule.legacy ? { legacy: c.rule.legacy } : {}),
					severity,
					path: source.path,
					span: { from: span.from, to: span.to },
					start: parsed.position(span.from),
					end: parsed.position(span.to),
					...(lang.locate ? { location: lang.locate(parsed.tree, span) } : {}),
					message: input.message,
					...(input.hint !== undefined ? { hint: input.hint } : {}),
					fixes: c.rule.fixable ? (input.fixes ?? []).map((f) => lowerFix(ruleset, parsed, f, id)) : [],
					data: input.data ?? {},
				});
				// A fix from a rule that did not declare `fixable` was never held to a `fixed` example,
				// so it is dropped and reported rather than applied (red team, 2026-10-29).
				if (!c.rule.fixable && input.fixes?.length && !st.undeclared.has('fix')) {
					st.undeclared.add('fix');
					findings.push(ownFinding(parsed, source.path, 'squadra/undeclared-fix', 'error', `${c.id} offered a fix without declaring \`fixable: true\`; the fix was dropped.`, { from: 0, to: 0 }, { rule: c.id }));
				}
			},
		};
		return st;
	});

	const run = (st: State, fn: () => void) => {
		if (st.dead) return;
		const t0 = now();
		let threw: unknown = null;
		try {
			fn();
		} catch (e) {
			threw = e;
		} finally {
			st.ms += now() - t0;
		}
		// The stop flag decides, not the exception: a rule that swallowed the signal is still stopped.
		if (st.stop) {
			st.dead = true;
			if (st.stop === 'budget') findings.push(ownFinding(parsed, source.path, 'squadra/budget-exceeded', 'warning', `${st.c.id} passed its budget of ${st.c.budget.ops} ops on this file and was stopped.`, { from: 0, to: 0 }, { rule: st.c.id }));
			else findings.push(ownFinding(parsed, source.path, 'squadra/findings-capped', 'warning', `${st.c.id} reached its cap of ${st.c.budget.findings} findings on this file; the rest are not reported.`, { from: 0, to: 0 }, { rule: st.c.id }));
		} else if (threw !== null) {
			st.dead = true;
			findings.push(ownFinding(parsed, source.path, 'squadra/rule-threw', 'error', `${st.c.id} threw: ${(threw as Error)?.message ?? threw}`, { from: 0, to: 0 }, { rule: st.c.id }));
		}
	};

	// One walk, in document order; every rule that visits a node's kind runs on it.
	const visiting = states.filter((s) => s.c.visits.length);
	if (visiting.length) {
		const up = parsed.up();
		// One memo per selector for the whole walk, so dispatch costs O(nodes × steps) at any depth.
		const memos = new Map<Complex, MatchMemo>();
		const memoOf = (cx: Complex) => {
			let m = memos.get(cx);
			if (!m) memos.set(cx, (m = matchMemo()));
			return m;
		};
		const walk = (n: Node) => {
			for (const k of n.kids) {
				const inert = parsed.inert.length > 0 && inInert(parsed.inert, k);
				for (const st of visiting) {
					if (st.dead || (inert && !st.c.inert)) continue;
					for (const d of st.c.visits) {
						if (st.dead) break;
						run(st, () => {
							st.ops++;
							if (d.list.some((cx) => matches(k, cx, parsed.root, up, undefined, memoOf(cx)))) d.handler(k, st.ctx);
						});
					}
				}
				walk(k);
			}
		};
		walk(parsed.root);
	}
	for (const st of states) {
		const check = st.c.rule.check;
		if (check) run(st, () => check(parsed.root, st.ctx));
	}
	for (const st of states) perRule[st.c.id] = { ms: st.ms, ops: st.ops };
	return { findings, perRule };
}

/** A test for the ids `only` selects: ids, or globs such as `deck/*`. */
export function onlyTest(only?: readonly string[]): (id: string) => boolean {
	if (!only) return () => true;
	const pats = only.map((o) => new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
	return (id) => pats.some((p) => p.test(id));
}

export function selectRules(rules: Ruleset, only?: readonly string[]): readonly CompiledRule[] {
	const keep = onlyTest(only);
	return rules.rules.filter((r) => keep(r.id));
}

/** What the fix driver needs to know about a produced finding that a rule would declare. */
export interface ProducedMeta {
	readonly inert: boolean;
	readonly changes: ReadonlySet<string>;
}

/** Findings from producers (design §15.4), lowered like a rule's. A producer that throws is
 *  reported and skipped, like a rule that throws. */
export function runProducers(ruleset: Ruleset, parsed: Parsed, producers: readonly Producer[], keep: (id: string) => boolean, meta?: Map<Finding, ProducedMeta>): Finding[] {
	const out: Finding[] = [];
	const { source } = parsed;
	for (const p of producers) {
		let list: readonly ProducedFinding[];
		try {
			list = p.produce(source);
		} catch (e) {
			out.push(ownFinding(parsed, source.path, 'squadra/rule-threw', 'error', `the producer ${p.id} threw: ${(e as Error)?.message ?? e}`, { from: 0, to: 0 }, { producer: p.id }));
			continue;
		}
		for (const pf of list) {
			if (!keep(pf.rule)) continue;
			if (typeof pf.rule !== 'string' || pf.rule.startsWith('squadra/') || !Object.hasOwn(SEVERITY_RANK, pf.severity)) {
				out.push(ownFinding(parsed, source.path, 'squadra/rule-threw', 'error', `the producer ${p.id} reported a finding with a reserved rule id or an unknown severity`, { from: 0, to: 0 }, { producer: p.id }));
				continue;
			}
			const span = pf.span;
			if (!(span && span.from >= 0 && span.from <= span.to && span.to <= source.text.length)) {
				out.push(ownFinding(parsed, source.path, 'squadra/rule-threw', 'error', `the producer ${p.id} reported ${pf.rule} at a span outside the text`, { from: 0, to: 0 }, { producer: p.id, rule: pf.rule }));
				continue;
			}
			const f: Finding = {
				rule: pf.rule,
				...(pf.legacy ? { legacy: pf.legacy } : {}),
				severity: pf.severity,
				path: source.path,
				span: { from: span.from, to: span.to },
				start: parsed.position(span.from),
				end: parsed.position(span.to),
				...(parsed.lang?.locate ? { location: parsed.lang.locate(parsed.tree, span) } : {}),
				message: pf.message,
				...(pf.hint !== undefined ? { hint: pf.hint } : {}),
				fixes: (pf.fixes ?? []).map((fx) => lowerFix(ruleset, parsed, fx, { rule: pf.rule, span, message: pf.message })),
				data: pf.data ?? {},
			};
			meta?.set(f, { inert: !!pf.inert, changes: new Set(pf.changes ?? []) });
			out.push(f);
		}
	}
	return out;
}

export function sortFindings(list: Finding[]): Finding[] {
	return list.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.span.from - b.span.from || a.span.to - b.span.to || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
}

/** Lint text already in memory. Synchronous: there is no I/O. */
export function lint(rules: Ruleset, sources: Iterable<Source>, opts: LintOptions = {}): LintResult {
	const chosen = selectRules(rules, opts.only);
	let findings: Finding[] = [];
	const perRule: Record<string, { ms: number; ops: number }> = {};
	const paths: string[] = [];
	const texts = new Map<string, string>();
	for (const source of sources) {
		paths.push(source.path);
		texts.set(source.path, source.text);
		const parsed = parseSource(rules, source);
		const raw = runRules(rules, parsed, chosen, opts);
		findings.push(...raw.findings);
		if (opts.producers) findings.push(...runProducers(rules, parsed, opts.producers, onlyTest(opts.only)));
		for (const [id, s] of Object.entries(raw.perRule)) {
			const t = perRule[id] ?? (perRule[id] = { ms: 0, ops: 0 });
			t.ms += s.ms;
			t.ops += s.ops;
		}
	}
	for (const p of rules.refused) findings.push(ownFinding(null, '', 'squadra/rule-refused', 'error', `${p.rule ?? 'a rule'} was refused (${p.code}): ${p.message}`, undefined, { code: p.code, ...(p.rule ? { refused: p.rule } : {}) }));
	if (opts.waivers) findings = applyWaivers(findings, opts.waivers, { coverage: opts.coverage ?? (opts.only ? 'partial' : 'full'), now: opts.now, paths, text: (f) => (texts.get(f.path) ?? '').slice(f.span.from, f.span.to) });
	if (opts.minSeverity) {
		const floor = SEVERITY_RANK[opts.minSeverity];
		findings = findings.filter((f) => SEVERITY_RANK[f.severity] <= floor);
	}
	return { findings: sortFindings(findings), stats: { files: paths.length, perRule } };
}
