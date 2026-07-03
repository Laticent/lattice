// Pure, DOM-free helpers shared by the shell and its tests — so the splitting and
// the "unknown component" detection (the engine of the inline-validation badge)
// are property-testable without rendering anything.

import { fenceRanges } from './slide-directives';

// A slide separator is a `---` (3+ dashes) line flanked by newlines — but NOT one
// inside a fenced code block (a mermaid block's `---` front matter, a YAML sample).
// Scanning was fence-blind, which split such slides into pieces and corrupted the
// deck on the next structural edit. `separatorPositions` masks fences once and every
// splitter/locator below shares it, so they never disagree.
const SEP_RE = /\n-{3,}\n/g;
function separatorPositions(src: string): Array<{ index: number; length: number }> {
	const text = String(src ?? '');
	const fences = fenceRanges(text);
	const inFence = (i: number) => fences.some(([a, b]) => i >= a && i < b);
	const out: Array<{ index: number; length: number }> = [];
	let m: RegExpExecArray | null;
	SEP_RE.lastIndex = 0;
	while ((m = SEP_RE.exec(text))) {
		// The separator "line" is the dashes; the match includes the flanking newlines.
		if (!inFence(m.index + 1)) out.push({ index: m.index, length: m[0].length });
	}
	return out;
}

/** Split deck source into trimmed, non-empty slide chunks on `---` fences (fence-aware). */
export function splitSlides(src: string): string[] {
	const text = String(src ?? '');
	const seps = separatorPositions(text);
	const chunks: string[] = [];
	let pos = 0;
	for (const s of seps) {
		chunks.push(text.slice(pos, s.index));
		pos = s.index + s.length;
	}
	chunks.push(text.slice(pos));
	return chunks.map((s) => s.trim()).filter(Boolean);
}

// First token of a `_class` value — the COMPONENT — tolerating extra modifier
// tokens (`_class: kpi dark scale-xl`), which the old single-token regex missed
// (so the rail chip read `text` and the score miscounted a modified slide).
const CLASS_RE = /<!--\s*_class:\s*([A-Za-z0-9-]+)(?:[ \t][^\n>]*?)?\s*-->/g;

/** The `_class` component names used in the source, in document order. */
export function usedComponents(src: string): string[] {
	const out: string[] = [];
	let m: RegExpExecArray | null;
	CLASS_RE.lastIndex = 0;
	while ((m = CLASS_RE.exec(String(src ?? '')))) out.push(m[1]);
	return out;
}

/** Component names used in the source that are NOT in the known set. */
export function unknownComponents(src: string, known: Iterable<string>): string[] {
	const set = new Set(known);
	return usedComponents(src).filter((n) => !set.has(n));
}

/** The component label for a single slide — its first `_class`, or `text` for a
 *  bare-Markdown slide. Drives the slide-navigator chips. */
export function slideClass(slideSrc: string): string {
	CLASS_RE.lastIndex = 0;
	return CLASS_RE.exec(String(slideSrc ?? ''))?.[1] ?? 'text';
}

/** Zero-based index of the slide containing character offset `pos` — the count of
 *  `---` fences before it. Pairs with splitSlides() to sync editor cursor ↔ preview. */
export function slideIndexAt(src: string, pos: number): number {
	const at = Math.max(0, pos);
	return separatorPositions(src).filter((s) => s.index < at).length;
}

/** Character offset where slide `index` begins — just past its preceding fence.
 *  The inverse of slideIndexAt, for scrolling the editor to a slide. */
export function slideStartOffset(src: string, index: number): number {
	if (index <= 0) return 0;
	const seps = separatorPositions(src);
	const s = seps[Math.min(index, seps.length) - 1];
	return s ? s.index + s.length : 0;
}

export type PresentLens = 'full' | 'exec' | 'onepager';

/** The slides to present under a reader lens (plan §17: "meet the reader where
 *  they are"). `full` = the whole deck; `exec` = the headline slides only;
 *  `onepager` = the single most load-bearing slide. Pure; always non-empty when
 *  given a non-empty deck (falls back to the full deck rather than nothing). */
export function presentationSet(slides: string[], lens: PresentLens): string[] {
	const all = Array.isArray(slides) ? slides.filter((s) => typeof s === 'string') : [];
	if (lens === 'full' || all.length === 0) return all;
	if (lens === 'exec') {
		const keep = new Set(['title', 'kpi', 'stats', 'big-number', 'closing']);
		const sub = all.filter((s) => keep.has(slideClass(s)));
		return sub.length ? sub : all;
	}
	// onepager — the single most "headline" slide, else the opener.
	const hero = all.find((s) => ['kpi', 'stats', 'big-number'].includes(slideClass(s)));
	return [hero ?? all[0]];
}

export type DeckScore = {
	/** 0–10 board-readiness, one decimal. */
	score: number;
	/** Overall posture for the status tag. */
	intent: 'pass' | 'review' | 'fix';
	rows: { label: string; ok: boolean; note: string }[];
};

/** A deterministic, deck-reactive readiness score for the Architect. NOT an AI
 *  judgement — a transparent heuristic over what's measurable in the source
 *  (valid components, an opening title, component variety, enough slides) so the
 *  scorecard moves as you edit. Pure + fuzz-tested; never throws. */
export function scoreDeck(source: string, known: Iterable<string>): DeckScore {
	const slides = splitSlides(source);
	const used = usedComponents(source);
	const unknown = unknownComponents(source, known);
	const variety = new Set(used).size;
	const n = slides.length;

	const validOk = unknown.length === 0;
	const titleOk = used.includes('title');
	const varietyOk = variety >= Math.min(3, Math.max(1, n));

	let score = 10;
	score -= Math.min(6, unknown.length * 1.5); // unknown components are the big hit
	if (!titleOk) score -= 1;
	if (!varietyOk) score -= 1;
	if (n < 3) score -= 1;
	score = Math.max(0, Math.min(10, score));

	const intent: DeckScore['intent'] = !validOk ? 'fix' : score >= 8 ? 'pass' : 'review';

	return {
		score: Math.round(score * 10) / 10,
		intent,
		rows: [
			{ label: 'Components valid', ok: validOk, note: validOk ? 'pass' : `${unknown.length} to fix` },
			{ label: 'Opens with a title', ok: titleOk, note: titleOk ? 'pass' : 'add title' },
			{ label: 'Variety', ok: varietyOk, note: `${variety} type${variety === 1 ? '' : 's'}` },
		],
	};
}
