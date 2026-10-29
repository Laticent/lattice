// The fix driver (design §7.4). Every fix, from every engine and every producer, is checked,
// applied and verified here, so the guarantees hold whatever made the fix:
//
//   1. lint, and take each finding's first fix at or under the requested safety grade;
//   2. plan: order by the ruleset's `order`, severity, position, rule id; accept a fix only if it
//      conflicts with nothing accepted and edits no inert range its rule did not opt into;
//   3. apply every accepted fix in one left-to-right build;
//   4. verify the document's SHAPE (units, header, inert text) and find the fix that broke it by
//      halving; verify each fix RESOLVED its own finding, and stop a rule whose fix did not;
//   5. repeat until a pass applies nothing, the text repeats, or `maxPasses`.
//
// The driver never writes anything: it returns text.

import { apply, editsConflict, mapOffset } from './edits.js';
import { onlyTest, type Parsed, type ProducedMeta, parseSource, runProducers, runRules, selectRules, sortFindings, touchesInert } from './lint.js';
import { type CompiledRule, type Ruleset, SAFETY_RANK, SEVERITY_RANK } from './ruleset.js';
import type { AppliedFix, EditGroup, Finding, FixOptions, FixResult, LoweredFix, Shape, SkippedFix, SkipReason, Source, Span } from './types.js';

interface Candidate {
	readonly finding: Finding;
	readonly fix: LoweredFix & { readonly edits: NonNullable<LoweredFix['edits']> };
	readonly group: EditGroup;
	readonly declared: ReadonlySet<string>;
	readonly exclusive: boolean;
	readonly signature: string;
}

interface Round {
	readonly text: string;
	readonly parsed: Parsed;
	readonly findings: Finding[];
	readonly meta: Map<Finding, ProducedMeta>;
}

/** Which shape kinds differ between two shapes (design §7.4 step 5). */
export function shapeChanges(a: Shape, b: Shape): Set<string> {
	const out = new Set<string>();
	if (a.units !== b.units) out.add('slide-count');
	if (!!a.header !== !!b.header) out.add('front-matter');
	if (a.inert.length !== b.inert.length || a.inert.some((t, i) => t !== b.inert[i])) out.add('inert');
	return out;
}

export function fix(rules: Ruleset, source: Source, opts: FixOptions = {}): FixResult {
	const ceiling = SAFETY_RANK[opts.safety ?? 'safe'];
	if (opts.safety === 'unsafe' && (!opts.only?.length || opts.only.some((o) => o.includes('*')))) throw new RangeError('squadra: fix() applies unsafe fixes only to rules named in `only`, by id, not by glob');
	const maxPasses = opts.maxPasses ?? 10;
	const keep = onlyTest(opts.only);
	const chosen = selectRules(rules, opts.only);
	const byId = new Map<string, CompiledRule>(rules.rules.map((r) => [r.id, r]));
	const producers = opts.producers ?? [];
	const orderIndex = new Map(rules.order.map((id, i) => [id, i]));

	// One cached round: the resolution check's lint is the next pass's lint when nothing reverts.
	let cached: Round | null = null;
	const round = (text: string): Round => {
		if (cached && cached.text === text) return cached;
		const parsed = parseSource(rules, { ...source, text });
		const meta = new Map<Finding, ProducedMeta>();
		const findings = runRules(rules, parsed, chosen, { measurements: opts.measurements }).findings;
		findings.push(...runProducers(rules, parsed, producers, keep, meta));
		cached = { text, parsed, findings: sortFindings(findings), meta };
		return cached;
	};

	const applied: AppliedFix[] = [];
	const permanent: SkippedFix[] = [];
	let transient: SkippedFix[] = [];
	const stoppedRules = new Set<string>(); // did-not-resolve: no more fixes from this rule
	const blocked = new Set<string>(); // broke-structure: this exact fix, wherever it lands
	const seen = new Set<string>([source.text]);
	let text = source.text;
	let passes = 0;
	let oneAtATime = false;
	let finished = false;
	// A fix that keeps rewriting and growing one place, pass after pass, without its finding ever
	// matching (its message changes each time), is caught by tracking where each rule last grew the
	// text. Three passes running is a non-converging fix: the run rewinds to before the first of them
	// and stops that rule (red team, 2026-10-29). `history[k]` is the text at the start of pass k.
	const GROW_LIMIT = 3;
	interface Chain {
		readonly rule: string;
		region: Span;
		count: number;
		readonly startPass: number;
		touched: boolean;
	}
	let chains: Chain[] = [];
	const history: string[] = [];

	const inertOk = (r: Round, f: Finding) => byId.get(f.rule)?.inert ?? r.meta.get(f)?.inert ?? false;
	const declaredOf = (r: Round, f: Finding): ReadonlySet<string> => byId.get(f.rule)?.changes ?? r.meta.get(f)?.changes ?? new Set();

	for (let pass = 1; pass <= maxPasses; pass++) {
		history[pass] = text;
		const r = round(text);
		transient = [];
		const candidates: Candidate[] = [];
		for (const f of r.findings) {
			if (f.rule.startsWith('squadra/') || !f.fixes.length) continue;
			const skip = (reason: SkipReason, detail?: string) => transient.push({ rule: f.rule, span: f.span, reason, ...(detail ? { detail } : {}) });
			// Already recorded as a permanent skip when the rule was stopped.
			if (stoppedRules.has(f.rule)) continue;
			const eligible = f.fixes.find((x) => x.edits && SAFETY_RANK[x.safety] <= ceiling);
			if (!eligible) {
				const first = f.fixes[0];
				if (first.edits) skip('safety', `the fix is ${first.safety}`);
				else skip(first.skip ?? 'stale', first.detail);
				continue;
			}
			const fx = eligible as Candidate['fix'];
			const signature = `${f.rule}\u0000${f.message}\u0000${r.text.slice(f.span.from, f.span.to)}\u0000${fx.edits.map((e) => `${r.text.slice(e.from, e.to)}\u0001${e.text}`).join('\u0002')}`;
			// Already recorded as a permanent skip when the fix was caught.
			if (blocked.has(signature)) continue;
			candidates.push({
				finding: f,
				fix: fx,
				group: { id: `${f.rule}@${f.span.from}`, edits: fx.edits },
				declared: declaredOf(r, f),
				exclusive: !!rules.engines.get(fx.engine)?.exclusive,
				signature,
			});
		}
		candidates.sort((a, b) => {
			const oa = orderIndex.get(a.finding.rule) ?? Number.MAX_SAFE_INTEGER;
			const ob = orderIndex.get(b.finding.rule) ?? Number.MAX_SAFE_INTEGER;
			return oa - ob || SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] || a.finding.span.from - b.finding.span.from || cmp(a.finding.rule, b.finding.rule) || cmp(a.finding.message, b.finding.message);
		});

		// Plan.
		let accepted: Candidate[] = [];
		for (const c of candidates) {
			const skip = (reason: SkipReason, detail?: string) => transient.push({ rule: c.finding.rule, span: c.finding.span, reason, ...(detail ? { detail } : {}) });
			if (!c.exclusive && !inertOk(r, c.finding) && c.fix.edits.some((e) => touchesInert(r.parsed.inert, e))) {
				skip('inert', 'the fix edits an inert range (a code fence, a comment) its rule did not opt into');
				continue;
			}
			if (accepted.some((a) => a.exclusive) || (c.exclusive && accepted.length) || (oneAtATime && accepted.length)) {
				skip('conflict', c.exclusive ? 'a whole-file fix runs in a pass of its own' : undefined);
				continue;
			}
			if (accepted.some((a) => a.group.edits.some((x) => c.group.edits.some((y) => editsConflict(x, y))))) {
				skip('conflict');
				continue;
			}
			accepted.push(c);
		}
		oneAtATime = false;
		if (!accepted.length) {
			finished = true;
			break;
		}

		// Apply and verify, reverting until what is left is sound.
		const before = r.parsed.shape();
		const applyAll = (list: readonly Candidate[]) => apply(r.text, { accepted: list.map((c) => c.group), rejected: [] });
		const shapeOk = (list: readonly Candidate[]): boolean => {
			const changes = shapeChanges(before, parseSource(rules, { ...source, text: applyAll(list) }).shape());
			if (!changes.size) return true;
			// Each fix was checked on its own first, so a change in the combined result is either one a
			// fix in the batch declares, or two fixes interacting, which the halving below isolates.
			return [...changes].every((k) => list.some((c) => c.declared.has(k)));
		};
		// Each fix alone first: two fixes whose shape changes cancel (one deletes a slide break, one adds
		// one) pass a check of their combined result, so a combined check alone cannot see either.
		if (accepted.length > 1) {
			for (const c of [...accepted]) {
				if (shapeOk([c])) continue;
				permanent.push({ rule: c.finding.rule, span: c.finding.span, reason: 'broke-structure', detail: 'the fix changed the document shape (units, header or inert text) and its rule did not declare that change' });
				blocked.add(c.signature);
				accepted = accepted.filter((x) => x !== c);
			}
		}
		let next = r.text;
		let interaction = false;
		for (;;) {
			if (!accepted.length) break;
			if (!shapeOk(accepted)) {
				// The smallest failing prefix ends at the culprit (at most log2(n) extra applies).
				let lo = 1;
				let hi = accepted.length;
				while (lo < hi) {
					const mid = (lo + hi) >> 1;
					if (shapeOk(accepted.slice(0, mid))) lo = mid + 1;
					else hi = mid;
				}
				const culprit = accepted[lo - 1];
				if (shapeOk([culprit])) {
					// Two fixes break the shape only together: revert the pass, apply one at a time.
					interaction = true;
					accepted = [];
					break;
				}
				permanent.push({ rule: culprit.finding.rule, span: culprit.finding.span, reason: 'broke-structure', detail: 'the fix changed the document shape (units, header or inert text) and its rule did not declare that change' });
				blocked.add(culprit.signature);
				accepted = accepted.filter((c) => c !== culprit);
				continue;
			}
			next = applyAll(accepted);
			const p = { accepted: accepted.map((c) => c.group), rejected: [] };
			const after = round(next);
			const unresolved = accepted.filter((c) => {
				const mapped: Span = { from: mapOffset(p, c.finding.span.from, 'before'), to: mapOffset(p, c.finding.span.to, 'after') };
				return after.findings.some((f) => f.rule === c.finding.rule && f.message === c.finding.message && sameSpot(f.span, mapped));
			});
			if (!unresolved.length) break;
			for (const c of unresolved) {
				permanent.push({ rule: c.finding.rule, span: c.finding.span, reason: 'did-not-resolve', detail: 'after the fix, the rule still reported the same finding at the same place' });
				stoppedRules.add(c.finding.rule);
			}
			accepted = accepted.filter((c) => !unresolved.includes(c));
			next = r.text;
		}
		if (interaction) {
			oneAtATime = true;
			continue;
		}
		if (!accepted.length) continue;
		if (seen.has(next)) {
			for (const c of accepted) permanent.push({ rule: c.finding.rule, span: c.finding.span, reason: 'cycle', detail: 'the text repeated an earlier pass' });
			finished = true;
			break;
		}
		seen.add(next);
		passes = pass;
		for (const c of accepted) applied.push({ rule: c.finding.rule, span: c.finding.span, edits: c.fix.edits, pass, description: c.fix.description });
		text = next;

		// Follow each rule's growth through this pass.
		const p = { accepted: accepted.map((c) => c.group), rejected: [] };
		for (const ch of chains) {
			ch.region = { from: mapOffset(p, ch.region.from, 'before'), to: mapOffset(p, ch.region.to, 'after') };
			ch.touched = false;
		}
		let runaway: Chain | null = null;
		for (const c of accepted) {
			const growth = c.fix.edits.reduce((n, e) => n + e.text.length - (e.to - e.from), 0);
			if (growth <= 0) continue;
			const lo = Math.min(...c.fix.edits.map((e) => e.from));
			const hi = Math.max(...c.fix.edits.map((e) => e.to));
			const region = { from: mapOffset(p, lo, 'before'), to: mapOffset(p, hi, 'after') };
			const ch = chains.find((x) => x.rule === c.finding.rule && !x.touched && x.region.from <= region.to && region.from <= x.region.to);
			if (ch) {
				ch.count++;
				ch.touched = true;
				ch.region = { from: Math.min(ch.region.from, region.from), to: Math.max(ch.region.to, region.to) };
				if (ch.count >= GROW_LIMIT && !runaway) runaway = ch;
			} else chains.push({ rule: c.finding.rule, region, count: 1, startPass: pass, touched: true });
		}
		chains = chains.filter((ch) => ch.touched);
		if (runaway) {
			const first = applied.find((a) => a.rule === runaway.rule && a.pass === runaway.startPass);
			permanent.push({ rule: runaway.rule, span: first?.span ?? { from: 0, to: 0 }, reason: 'did-not-resolve', detail: `the fix grew the same place ${GROW_LIMIT} passes running without resolving its finding; the run rewound to before the first of them` });
			stoppedRules.add(runaway.rule);
			text = history[runaway.startPass];
			applied.splice(0, applied.length, ...applied.filter((a) => a.pass < runaway.startPass));
			seen.clear();
			seen.add(text);
			chains = [];
		}
	}

	const last = round(text);
	if (!finished) {
		// Out of passes: whatever is still fixable is reported, never dropped silently.
		for (const f of last.findings) {
			if (f.fixes.some((x) => x.edits && SAFETY_RANK[x.safety] <= ceiling) && !stoppedRules.has(f.rule)) permanent.push({ rule: f.rule, span: f.span, reason: 'max-passes' });
		}
		transient = [];
	}
	return {
		text: opts.dryRun ? source.text : text,
		applied,
		skipped: [...permanent, ...transient],
		passes,
		remaining: last.findings,
	};
}

function cmp(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Is a finding after the fix at the place the fixed finding's span maps to? Ranges must overlap
 *  strictly, so a finding on the next line, which merely touches a deleted line's mapped point,
 *  does not count. A zero-width mapped span (the text was deleted) counts only when a finding
 *  contains it or sits exactly on it. */
function sameSpot(f: Span, m: Span): boolean {
	if (m.from === m.to) return f.from === f.to ? f.from === m.from : f.from < m.from && m.from < f.to;
	if (f.from === f.to) return m.from < f.from && f.from < m.to;
	return f.from < m.to && m.from < f.to;
}
