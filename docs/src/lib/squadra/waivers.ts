// Waivers and ratchets (design §9.1, §9.3). Every exception names a rule, a file and a reason, and
// fails when it stops being needed: the "allowlist with a justification that fails when stale"
// pattern Lattice's ownership gate hand-builds per list, built once.
//
// Squadra's own findings (`squadra/*`) can never be waived or ratcheted.

import { globToRegExp } from './ruleset.js';
import type { Finding, Ratchet, Severity, WaiverSet } from './types.js';

export interface WaiverOptions {
	/** Staleness and ratchet-down run only on a full run: a partial run cannot know whether a file
	 *  it did not lint still needs its waiver. */
	readonly coverage: 'full' | 'partial';
	/** ISO date. Without it no waiver expires. */
	readonly now?: string;
	/** Every path the run linted: a ratchet glob expands over these. */
	readonly paths: readonly string[];
	/** The source text of a finding's span; `lint` supplies it. */
	readonly text?: (f: Finding) => string;
}

function own(path: string, rule: string, severity: Severity, message: string, data: Record<string, unknown>): Finding {
	return { rule, severity, path, span: { from: 0, to: 0 }, start: { line: 1, column: 1 }, end: { line: 1, column: 1 }, message, fixes: [], data };
}

/** Problems with the waiver file itself, the checks a schema cannot express. */
export function checkWaiverSet(set: WaiverSet): string[] {
	const out: string[] = [];
	set.waivers.forEach((w, i) => {
		if (!w.reason?.trim()) out.push(`waivers[${i}] (${w.rule}) has no reason`);
		if (/[*?]/.test(w.target)) out.push(`waivers[${i}] (${w.rule}) targets the glob '${w.target}'; a waiver covers one file, and a glob belongs to a ratchet`);
		if (w.count !== undefined && !(Number.isInteger(w.count) && w.count >= 1)) out.push(`waivers[${i}] (${w.rule}) has count ${w.count}; a count is a whole number from 1`);
		if (w.rule.startsWith('squadra/')) out.push(`waivers[${i}] waives ${w.rule}; Squadra's own findings cannot be waived`);
		if (w.expires != null && !/^\d{4}-\d{2}-\d{2}$/.test(w.expires)) out.push(`waivers[${i}] (${w.rule}) expires '${w.expires}'; write the date as YYYY-MM-DD`);
	});
	set.ratchets.forEach((r, i) => {
		if (!r.reason?.trim()) out.push(`ratchets[${i}] (${r.rule}) has no reason`);
		if (!(Number.isInteger(r.budget) && r.budget >= 0)) out.push(`ratchets[${i}] (${r.rule}) has budget ${r.budget}; a budget is a whole number from 0`);
		if (r.rule.startsWith('squadra/')) out.push(`ratchets[${i}] ratchets ${r.rule}; Squadra's own findings cannot be ratcheted`);
	});
	return out;
}

/** Apply waivers, then ratchets. Returns the findings that remain plus Squadra's findings about the
 *  exceptions themselves (stale, expired, over budget, under budget). */
export function applyWaivers(findings: readonly Finding[], set: WaiverSet, opts: WaiverOptions): Finding[] {
	const problems = checkWaiverSet(set);
	if (problems.length) throw new Error(`squadra: the waiver set is invalid:\n  ${problems.join('\n  ')}`);
	const covered = new Set<Finding>();
	const out: Finding[] = [];
	for (const w of set.waivers) {
		const count = w.count ?? 1;
		if (w.expires && opts.now && opts.now > w.expires) {
			out.push(own(w.target, 'squadra/expired-waiver', 'warning', `The waiver for ${w.rule} expired on ${w.expires}; it no longer suppresses anything. Fix the findings or renew it with a reason.`, { waived: w.rule, expires: w.expires }));
			continue;
		}
		let used = 0;
		for (const f of findings) {
			if (used >= count) break;
			if (covered.has(f) || f.rule.startsWith('squadra/') || f.path !== w.target || (f.rule !== w.rule && f.legacy !== w.rule)) continue;
			if (w.match !== undefined && !findingText(f, opts).includes(w.match)) continue;
			covered.add(f);
			used++;
		}
		if (used < count && opts.coverage === 'full') {
			out.push(own(w.target, 'squadra/stale-waiver', 'error', `The waiver for ${w.rule} covers ${count} finding${count === 1 ? '' : 's'} in ${w.target} but matched ${used}. Lower its count or delete it.`, { waived: w.rule, count, matched: used }));
		}
	}
	let rest = findings.filter((f) => !covered.has(f));
	for (const r of set.ratchets) rest = ratchet(rest, r, opts, out);
	return [...rest, ...out];
}

// The text a waiver's `match` reads: the source text at the finding's span, then its message.
function findingText(f: Finding, opts: WaiverOptions): string {
	return `${opts.text ? opts.text(f) : ''}\n${f.message}`;
}

function ratchet(findings: Finding[], r: Ratchet, opts: WaiverOptions, out: Finding[]): Finding[] {
	const re = /[*?]/.test(r.target) ? globToRegExp(r.target) : null;
	const files = re ? opts.paths.filter((p) => re.test(p)) : [r.target];
	let rest = findings;
	for (const file of files) {
		const mine = rest.filter((f) => f.path === file && !f.rule.startsWith('squadra/') && (f.rule === r.rule || f.legacy === r.rule));
		if (mine.length > r.budget) {
			out.push(own(file, 'squadra/ratchet-exceeded', 'error', `${file} has ${mine.length} ${r.rule} findings; its ratchet allows ${r.budget}. Fix the new ones.`, { rule: r.rule, budget: r.budget, found: mine.length }));
			continue;
		}
		rest = rest.filter((f) => !mine.includes(f));
		if (mine.length < r.budget && opts.coverage === 'full') {
			out.push(own(file, 'squadra/ratchet-down', 'suggestion', `${file} has ${mine.length} ${r.rule} findings, under its budget of ${r.budget}. Lower the budget to ${mine.length}.`, { rule: r.rule, budget: r.budget, found: mine.length }));
		}
	}
	return rest;
}
