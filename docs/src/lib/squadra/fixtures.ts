// The fixtures file (design §6.7): Markdown whose fences hold a rule's examples. A fence's info
// string is `<language-hint> <role> [name] [xN]`, where role is `bad`, `fixed` or `good`. In a
// `bad` example, `⟦` and `⟧` mark the spans the rule must report; they are removed before the
// example is linted. Everything outside the fences is prose for the generated docs.

import type { Span } from './types.js';

export type Role = 'bad' | 'fixed' | 'good';

export interface Example {
	readonly role: Role;
	/** `bad-1`, `good-2`, or the fence's own name. Unique within the file. */
	readonly name: string;
	/** The example's text, markers removed. Ends in a newline, like a file. */
	readonly text: string;
	/** The marked spans, in `text` offsets. Empty when the example marks none. */
	readonly spans: readonly Span[];
	/** `xN`: the exact number of findings a `bad` example must produce. */
	readonly count?: number;
	/** For `fixed`: the `bad` example it is the result of. */
	readonly pairs?: string;
	/** 1-based line of the opening fence, for error messages. */
	readonly line: number;
}

export interface Fixtures {
	readonly examples: readonly Example[];
	readonly errors: readonly { readonly line: number; readonly message: string }[];
}

const OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ROLES = new Set<string>(['bad', 'fixed', 'good']);
export const MARK_OPEN = '⟦';
export const MARK_CLOSE = '⟧';

export function parseFixtures(text: string): Fixtures {
	const lines = text.split('\n');
	const examples: Example[] = [];
	const errors: { line: number; message: string }[] = [];
	const counters: Record<Role, number> = { bad: 0, fixed: 0, good: 0 };
	const names = new Set<string>();
	let lastBad: string | undefined;
	for (let i = 0; i < lines.length; i++) {
		const m = OPEN.exec(lines[i]);
		if (!m) continue;
		const fence = m[1];
		const words = m[2].trim().split(/\s+/).filter(Boolean);
		// Find the close: the same character, at least as long, nothing else on the line.
		let close = -1;
		for (let j = i + 1; j < lines.length; j++) {
			const c = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[j]);
			if (c && c[1][0] === fence[0] && c[1].length >= fence.length) {
				close = j;
				break;
			}
		}
		const end = close < 0 ? lines.length : close;
		const roleWord = words.find((w) => ROLES.has(w));
		if (!roleWord) {
			i = end;
			continue;
		}
		const role = roleWord as Role;
		if (close < 0) errors.push({ line: i + 1, message: `the ${role} fence opened here never closes` });
		let count: number | undefined;
		let name: string | undefined;
		for (const w of words.slice(words.indexOf(roleWord) + 1)) {
			const x = /^x(\d+)$/.exec(w);
			if (x) count = Number(x[1]);
			else if (!/^file=/.test(w) && name === undefined) name = w;
		}
		// A fence inside the example that opens with the same character and at least the outer length
		// closes the example early and silently drops what follows (red team, 2026-10-29): refuse it.
		const inner = lines.slice(i + 1, end).find((l) => {
			const m = OPEN.exec(l);
			return m && m[1][0] === fence[0] && m[1].length >= fence.length && m[2].trim() !== '';
		});
		if (inner) errors.push({ line: i + 1, message: `the ${role} example holds a fence as long as its own (${inner.trim()}); open the example with a longer fence` });
		const body = lines.slice(i + 1, end).map((l) => `${l}\n`).join('');
		const marked = stripMarkers(body);
		if (marked.error) errors.push({ line: i + 1, message: marked.error });
		if (role !== 'bad' && marked.spans.length) errors.push({ line: i + 1, message: `a ${role} example cannot mark spans (⟦…⟧ belongs in bad examples)` });
		counters[role]++;
		const id = role === 'fixed' ? `fixed-${counters.fixed}` : (name ?? `${role}-${counters[role]}`);
		if (names.has(id)) errors.push({ line: i + 1, message: `two examples are named '${id}'` });
		names.add(id);
		let pairs: string | undefined;
		if (role === 'fixed') {
			pairs = name ?? lastBad;
			if (!pairs) errors.push({ line: i + 1, message: 'a fixed example has no bad example before it and names none' });
		}
		if (role === 'bad') lastBad = id;
		examples.push({ role, name: id, text: marked.text, spans: marked.spans, count, pairs, line: i + 1 });
		i = end;
	}
	for (const e of examples) {
		if (e.role === 'fixed' && e.pairs && !examples.some((b) => b.role === 'bad' && b.name === e.pairs)) {
			errors.push({ line: e.line, message: `the fixed example pairs with '${e.pairs}', which is not a bad example in this file` });
		}
	}
	return { examples, errors };
}

/** Remove `⟦`/`⟧` and return the spans they marked, in the stripped text's offsets. */
export function stripMarkers(text: string): { text: string; spans: Span[]; error?: string } {
	let out = '';
	const spans: Span[] = [];
	let open = -1;
	for (const ch of text) {
		if (ch === MARK_OPEN) {
			if (open >= 0) return { text, spans: [], error: 'a ⟦ opens inside another ⟦…⟧' };
			open = out.length;
		} else if (ch === MARK_CLOSE) {
			if (open < 0) return { text, spans: [], error: 'a ⟧ closes nothing' };
			spans.push({ from: open, to: out.length });
			open = -1;
		} else out += ch;
	}
	if (open >= 0) return { text, spans: [], error: 'a ⟦ never closes' };
	return { text: out, spans };
}
