// A GENERAL-PURPOSE OUTLINER — for any text whose units can be found by a function.
//
// Hand it how to find where units begin (`units`), and optionally where parts begin inside one
// (`parts`), and it builds and maintains the outline the hub reads. Three ready-made splitters
// cover the common shapes:
//
//   byPattern(/^## /m)       every line a pattern matches opens a unit (chapters, cues, cells);
//   byHeadings({ unit: 1, part: 2 })
//                            Markdown: `#` opens a unit, `##` a part inside it, fenced code
//                            ignored — a document outline, a book, a notes file;
//   byBlankLines()           paragraphs.
//
// It re-runs the splitter on every change, which is linear in the text and fine into the
// hundreds of kilobytes. Ids survive edits through the edit span (`carryIds`). A host with a
// heavier parser, or a document too large to rescan per keystroke, writes its own outliner
// against ./outline.ts, as Lattice does for slides (docs/src/lib/deck-outline).

import { carryIds, diffSpan, type EditSpan, nextRevision, type Outline, type Outliner, partBaseOf, spanHolds, type Unit } from './outline.js';

export interface TextOutlinerOptions {
	/** Offsets where units begin, ascending. Text before the first one belongs to unit 0. */
	units: (text: string) => readonly number[];
	/** Offsets where parts begin INSIDE one unit's text, ascending, relative to the unit start;
	 *  0 is implied. Omit for one part per unit. */
	parts?: (unitText: string) => readonly number[];
	/** Drop units with nothing but whitespace (default true). */
	dropEmpty?: boolean;
}

export function createTextOutliner(opts: TextOutlinerOptions): Outliner {
	const dropEmpty = opts.dropEmpty !== false;
	const build = (text: string, prev: Outline | null, span: EditSpan | null): Outline => {
		const starts = [...new Set(opts.units(text))].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
		if (starts[0] !== 0) starts.unshift(0);
		const raw: Array<{ from: number; start: number; end: number }> = [];
		for (let i = 0; i < starts.length; i++) {
			const from = starts[i];
			const end = i + 1 < starts.length ? starts[i + 1] : text.length;
			if (end < from) continue;
			const body = text.slice(from, end);
			const lead = body.length - body.trimStart().length;
			if (dropEmpty && lead === body.length) continue;
			raw.push({ from, start: from + Math.min(lead, body.length), end });
		}
		const ids = carryIds(prev, raw, text.length, span);
		const units: Unit[] = raw.map((r, i) => {
			const rel = r.start - r.from;
			const extra = opts.parts ? [...opts.parts(text.slice(r.from, r.end))].filter((n) => n > rel && n < r.end - r.from).sort((a, b) => a - b) : [];
			const parts = [rel];
			for (const n of extra) if (n > parts[parts.length - 1]) parts.push(n);
			return { id: ids[i], from: r.from, start: r.start, end: r.end, parts };
		});
		return { rev: nextRevision(), source: text, units, partBase: partBaseOf(units) };
	};
	return {
		update(prev, text, o) {
			if (prev && prev.source === text) return prev;
			const span = prev ? ((o?.span && spanHolds(prev.source, text, o.span)) || diffSpan(prev.source, text)) : null;
			return build(text, prev, span);
		},
	};
}

// ── Splitters ─────────────────────────────────────────────────────────────────

/** Every line the pattern matches opens a unit. The pattern is tested against each line. */
export function byPattern(line: RegExp): (text: string) => number[] {
	const re = new RegExp(line.source, line.flags.replace(/[gmy]/g, ''));
	return (text) => {
		const out: number[] = [];
		let at = 0;
		while (at <= text.length) {
			const nl = text.indexOf('\n', at);
			const end = nl < 0 ? text.length : nl;
			if (re.test(text.slice(at, end))) out.push(at);
			if (nl < 0) break;
			at = nl + 1;
		}
		return out;
	};
}

/** Paragraphs: a run of blank lines ends one. */
export function byBlankLines(): (text: string) => number[] {
	return (text) => {
		const out = [0];
		const re = /\n(?:[ \t]*\r?\n)+/g;
		for (let m = re.exec(text); m; m = re.exec(text)) out.push(m.index + m[0].length);
		return out;
	};
}

/** Markdown headings: a heading at level `unit` opens a unit; one at `part` (deeper) opens a part
 *  inside it. Fenced code (``` or ~~~) is skipped, so a `#` comment in a code block is not a
 *  heading. ATX headings only — enough for an outline; a host that needs CommonMark exactness
 *  uses its own parser. */
export function byHeadings(levels: { unit?: number; part?: number } = {}): Required<Pick<TextOutlinerOptions, 'units' | 'parts'>> {
	const unitLevel = levels.unit ?? 1;
	const partLevel = levels.part ?? unitLevel + 1;
	const headings = (text: string, level: number) => {
		const out: number[] = [];
		let fence: string | null = null;
		let at = 0;
		while (at <= text.length) {
			const nl = text.indexOf('\n', at);
			const line = text.slice(at, nl < 0 ? text.length : nl);
			const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
			if (f) {
				// A fence closes on a run of the same character, at least as long as the one that opened it,
				// A closing fence carries nothing after it (an info string makes it content).
				if (fence === null) fence = f[1];
				else if (f[1][0] === fence[0] && f[1].length >= fence.length && line.slice(line.indexOf(f[1]) + f[1].length).trim() === '') fence = null;
			} else if (fence === null) {
				const h = /^ {0,3}(#{1,6})(?:[ \t]|$)/.exec(line);
				if (h && h[1].length === level) out.push(at);
			}
			if (nl < 0) break;
			at = nl + 1;
		}
		return out;
	};
	return { units: (t) => headings(t, unitLevel), parts: (t) => headings(t, partLevel) };
}
