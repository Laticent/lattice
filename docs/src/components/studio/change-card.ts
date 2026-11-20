// The chat change card's logic: apply, discard and undo ONE proposed edit at a time, by content.
// engineering/decisions/2026-11-19-chat-card-apply-undo.md (§3, §5, §6, §10).
//
// A proposal's edits address the deck AS IT WAS when the reply arrived ("replace slide 4", "insert after
// slide 2"). Applied all at once, highest slide first, those numbers hold. Applied ONE AT A TIME, in any
// order, with the author typing in between, they do not: applying a new slide 3 makes the old slide 4 the
// new slide 5. So every per-row action here finds its slide by its TEXT, and uses the number only as a
// prediction to break a tie between identical slides:
//
//   · apply a replace/delete → the slide that still reads the edit's `before` (a blank slide: a blank one)
//   · apply an insert        → after the slide reading its `anchor` (the slide it was proposed to follow)
//   · undo a replace         → the slide that still reads the edit's `after`, put back to `before`
//   · undo an insert         → the inserted slide(s), still reading `after`, removed
//   · undo a delete          → `before` re-inserted after the slide reading its `anchor`
//   · a front-matter key     → read and written by key, never by position
//
// When the text is not there (the author edited that slide), the action refuses: Apply reports the slide
// "changed since proposed", Undo reports "you've edited it since". Nothing is ever applied to a slide
// whose content the card cannot vouch for. A thread from before anchors were recorded falls back to the
// number for where a new slide goes. Pure: no React, no storage, no clock.

import { sliceSlide, slideCount, splitTopLevel } from '@/components/studio/ai/architect-edits.js';
import { frontMatterBlockText, getFrontMatter } from '../../lib/front-matter';
import { applyProposedEditsChecked } from './architect';
import type { ChatProposal } from './studio-store';

export type RowState = 'waiting' | 'applied' | 'discarded' | 'undone';
type Raw = ChatProposal['raw'];

const END = Number.MAX_SAFE_INTEGER;
const blocksOf = (body: string) =>
	splitTopLevel(String(body || '').trim())
		.map((s: string) => s.trim())
		.filter(Boolean);

/** The states a stored message's card is in. A message from before per-row states (`applied` alone) reads as all applied. */
export function rowStates(m: { proposed?: ChatProposal[]; rows?: RowState[]; applied?: boolean; autoApplied?: boolean }): RowState[] {
	const n = m.proposed?.length ?? 0;
	if (m.rows && m.rows.length === n) return m.rows;
	return Array.from({ length: n }, () => (m.applied || m.autoApplied ? 'applied' : 'waiting'));
}

/**
 * How far this card's own applied edits moved slide `n` (1-based, in the proposal's numbering): +k for each
 * applied insert that landed before it, −1 for each applied delete before it. Edits the author made outside
 * the card are invisible here, which is why this is only ever a tie-breaker for a content match.
 */
function shiftBefore(n: number, edits: ChatProposal[], states: RowState[], skip: number): number {
	let s = 0;
	edits.forEach((e, i) => {
		if (i === skip || states[i] !== 'applied') return;
		if (e.action === 'insert' && e.raw.slide !== END && e.raw.slide < n) s += blocksOf(e.after).length;
		if (e.action === 'delete' && e.raw.slide < n) s -= 1;
	});
	return s;
}

/** 1-based indices of the slides in `source` reading exactly `text` (a blank `text` finds the blank slides). */
function slidesReading(source: string, text: string): number[] {
	const want = text.trim();
	const out: number[] = [];
	const n = slideCount(source);
	for (let i = 1; i <= n; i++) if (sliceSlide(source, i).trim() === want) out.push(i);
	return out;
}
const nearest = (hits: number[], to: number) => hits.reduce((best, h) => (Math.abs(h - to) < Math.abs(best - to) ? h : best), hits[0]);

/** Where the slide an insert follows (or a deleted slide followed) is now: by its anchor's text, else predicted. */
function anchorAt(source: string, e: ChatProposal, predicted: number): number {
	if (e.anchor) {
		const hits = slidesReading(source, e.anchor);
		if (hits.length) return nearest(hits, predicted);
	}
	return predicted;
}

const fmNow = (source: string, e: ChatProposal) => {
	const key = e.raw.key ?? '';
	if (e.raw.block) return frontMatterBlockText(source, key) ?? '';
	const cur = getFrontMatter(source, key);
	return cur === undefined ? '' : `${key}: ${cur}`;
};

/** The raw edit that applies row `i` to the deck as it is now, or null when its slide no longer reads as proposed. */
export function applyTarget(source: string, edits: ChatProposal[], states: RowState[], i: number): Raw | null {
	const e = edits[i];
	// A deck setting the author has changed since the proposal is not overwritten, as a slide is not.
	if (e.action === 'frontmatter') return fmNow(source, e) === e.before ? e.raw : null;
	if (e.action === 'insert') {
		if (e.raw.slide === END || e.raw.slide === 0) return e.raw;
		const at = anchorAt(source, e, e.raw.slide + shiftBefore(e.raw.slide + 1, edits, states, i));
		return at < 0 || at > slideCount(source) ? null : { ...e.raw, slide: at };
	}
	const hits = slidesReading(source, e.before);
	if (!hits.length) return null;
	return { ...e.raw, slide: nearest(hits, e.raw.slide + shiftBefore(e.raw.slide, edits, states, i)) };
}

/** The raw edit(s) that take row `i` back out of the deck as it is now, or null when the author has edited it since. */
export function undoTarget(source: string, edits: ChatProposal[], states: RowState[], i: number): Raw[] | null {
	const e = edits[i];
	if (e.action === 'frontmatter') {
		const key = e.raw.key ?? '';
		if (fmNow(source, e) !== e.after) return null;
		if (e.raw.block) return [{ action: 'frontmatter', slide: 0, body: e.before, key, value: e.before ? e.before.split('\n').slice(1).join('\n') : null, block: true }];
		const prev = e.before ? e.before.slice(key.length + 2) : null;
		return [{ action: 'frontmatter', slide: 0, body: prev ?? '', key, value: prev }];
	}
	if (e.action === 'replace') {
		const hits = slidesReading(source, e.after);
		if (!hits.length) return null;
		return [{ action: 'replace', slide: nearest(hits, e.raw.slide + shiftBefore(e.raw.slide, edits, states, i)), body: e.before }];
	}
	if (e.action === 'insert') {
		// The inserted run, still reading as inserted, removed last slide first so the numbers hold.
		const blocks = blocksOf(e.after);
		const firsts = slidesReading(source, blocks[0] ?? '').filter((s) => blocks.every((b, k) => sliceSlide(source, s + k).trim() === b));
		if (!firsts.length) return null;
		const predicted = e.raw.slide === END ? slideCount(source) - blocks.length + 1 : e.raw.slide === 0 ? 1 : anchorAt(source, e, e.raw.slide + shiftBefore(e.raw.slide + 1, edits, states, i)) + 1;
		const first = nearest(firsts, predicted);
		return blocks.map((_, k) => ({ action: 'delete', slide: first + blocks.length - 1 - k, body: '' }));
	}
	if (e.action === 'delete') {
		// Put the slide back after the slide it followed. Refuse when it is already back there (⌘Z did it), so a
		// second copy never lands, and when the deck is now too short for that place.
		const after = e.raw.slide === 1 ? 0 : anchorAt(source, e, e.raw.slide - 1 + shiftBefore(e.raw.slide, edits, states, i));
		if (after < 0 || after > slideCount(source)) return null;
		if (sliceSlide(source, after + 1).trim() === e.before.trim()) return null;
		return [{ action: 'insert', slide: after, body: e.before }];
	}
	return null;
}

/**
 * The row states as the DECK now has them. ⌘Z and the author's own edits move the deck without the card
 * knowing; a row whose change ⌘Z took back would otherwise read "applied" with nothing to undo, and one ⌘Z
 * redid would read "undone" with nothing to apply. A replace, delete or deck setting is re-read from the deck:
 * an applied row whose slide reads its `before` again is undone, an undone row whose slide reads its `after`
 * again is applied. A new slide is left alone: an edited new slide and a removed one look the same.
 */
export function reconcile(source: string, edits: ChatProposal[], states: RowState[]): RowState[] {
	return states.map((s, i) => {
		const e = edits[i];
		if (e.action === 'insert') return s;
		const as = (t: RowState) => states.map((x, k) => (k === i ? t : x));
		if (s === 'applied' && !undoTarget(source, edits, states, i)) {
			const back = e.action === 'frontmatter' ? fmNow(source, e) === e.before : e.action === 'delete' ? slidesReading(source, e.before).length > 0 : applyTarget(source, edits, as('waiting'), i) !== null;
			if (back) return 'undone';
		}
		if (s === 'undone') {
			const again = e.action === 'delete' ? applyTarget(source, edits, as('waiting'), i) === null : undoTarget(source, edits, as('applied'), i) !== null;
			if (again) return 'applied';
		}
		return s;
	});
}

/** `reasons` says, per refused row, why: the splice's own words, or that the slide no longer reads as the card expects. */
export type RunOutcome = { source: string; done: number[]; refused: number[]; reasons: Record<number, string> };

/** Apply rows `idx` to `source`. Each row is retargeted against the deck as the previous rows left it. */
export function applyRows(source: string, edits: ChatProposal[], states: RowState[], idx: number[]): RunOutcome {
	let next = source;
	const st = [...states];
	const done: number[] = [];
	const refused: number[] = [];
	const reasons: Record<number, string> = {};
	// Highest proposed slide first, so a lower row's predicted number is not yet moved by a higher one.
	for (const i of [...idx].sort((a, b) => edits[b].raw.slide - edits[a].raw.slide)) {
		const raw = applyTarget(next, edits, st, i);
		const run = raw ? applyProposedEditsChecked(next, [{ raw }]) : null;
		if (run?.applied) {
			next = run.source;
			st[i] = 'applied';
			done.push(i);
		} else {
			refused.push(i);
			reasons[i] = run?.refusals[0] ?? `${rowName(edits[i]).lead} changed since the AI proposed this, so it was left alone.`;
		}
	}
	return { source: next, done, refused, reasons };
}

/** Undo rows `idx` against `source`, by content. A row the author has edited since is refused, never overwritten. */
export function undoRows(source: string, edits: ChatProposal[], states: RowState[], idx: number[]): RunOutcome {
	let next = source;
	const st = [...states];
	const done: number[] = [];
	const refused: number[] = [];
	const reasons: Record<number, string> = {};
	// From the highest proposed slide down, so the lower numbers stay valid.
	for (const i of [...idx].sort((a, b) => edits[b].raw.slide - edits[a].raw.slide)) {
		const raws = undoTarget(next, edits, st, i);
		const run = raws ? applyProposedEditsChecked(next, raws.map((raw) => ({ raw }))) : null;
		if (run?.applied && !run.refusals.length) {
			next = run.source;
			st[i] = 'undone';
			done.push(i);
		} else {
			refused.push(i);
			reasons[i] = raws
				? (run?.refusals[0] ?? `${rowName(edits[i]).lead} could not be undone.`)
				: `${rowName(edits[i]).lead} kept your edits, so it wasn't undone. Change it back by hand, or restore the version from before the AI edit in History (that replaces the whole deck).`;
		}
	}
	return { source: next, done, refused, reasons };
}

/** Where row `e`'s change sits in `source` after it was applied (1-based), for the Studio to show it; null when unknown. */
export function landingSlide(source: string, e: ChatProposal): number | null {
	if (e.action === 'frontmatter') return null;
	if (e.action === 'delete') {
		const at = e.raw.slide === 1 ? 0 : anchorAt(source, e, e.raw.slide - 1);
		return Math.max(1, Math.min(at + 1, slideCount(source)));
	}
	const hits = slidesReading(source, blocksOf(e.after)[0] ?? '');
	return hits.length ? nearest(hits, e.raw.slide === END ? slideCount(source) : e.raw.slide) : null;
}

/** What a row is called on the card: by its slide's title where it has one, since an insert renumbers the rest. */
export function rowName(e: ChatProposal): { lead: string; detail: string } {
	const title = (md: string) => md.match(/^#{1,3}\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, '').trim() ?? '';
	if (e.action === 'frontmatter') return { lead: 'Deck setting', detail: e.raw.key ?? '' };
	if (e.action === 'insert') {
		const n = blocksOf(e.after).length;
		const where = e.raw.slide === END ? 'at the end' : e.raw.slide === 0 ? 'at the start' : `after slide ${e.raw.slide}`;
		return { lead: n > 1 ? `${n} new slides` : 'New slide', detail: [title(e.after), where].filter(Boolean).join(' · ') };
	}
	if (e.action === 'delete') return { lead: `Slide ${e.raw.slide}`, detail: [title(e.before), 'removed'].filter(Boolean).join(' · ') };
	const a = title(e.before);
	const b = title(e.after);
	return { lead: `Slide ${e.raw.slide}`, detail: a && b && a !== b ? `${a} → ${b}` : b || a };
}

/** The one History entry a card keeps, its label kept current (§6): when, which ask, how much of it landed. */
export function cardHistoryLabel(ask: string, at: Date, states: RowState[]): string {
	const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
	const q = ask.trim().replace(/\s+/g, ' ');
	// Cut at a word boundary, never mid-word.
	const cut = q.length > 36 ? `${q.slice(0, 36).replace(/\s+\S*$/, '')}…` : q;
	const quote = q ? ` · “${cut}”` : '';
	const applied = states.filter((s) => s === 'applied').length;
	const tail = applied ? `(${applied} of ${states.length} applied)` : states.includes('undone') ? '(applied, then undone)' : '(none applied)';
	return `Before AI edit · ${clock}${quote} ${tail}`;
}

/** The line the next message carries so the AI knows what was done with its card (§10), or '' when nothing was decided.
 *  `auto`: Auto applied the edits, not the author, and the line says so. */
export function toldLine(edits: ChatProposal[], states: RowState[], auto = false): string {
	if (!states.some((s) => s !== 'waiting')) return '';
	const names = (s: RowState) => edits.flatMap((e, i) => (states[i] === s ? [rowName(e).lead.toLowerCase()] : []));
	const say = (s: RowState, verb: string) => (names(s).length ? `${verb} ${names(s).join(', ')}` : '');
	if (auto) return `[${[say('applied', 'Auto applied'), say('undone', 'the author undid'), say('discarded', 'the author discarded')].filter(Boolean).join('; ')}.]`;
	return `[The author ${[say('applied', 'applied'), say('discarded', 'discarded'), say('undone', 'undid'), say('waiting', 'has not decided on')].filter(Boolean).join('; ')}.]`;
}

/**
 * The note the NEWEST author message carries about earlier cards (#3208 items 5 and 27): what happened to each, oldest
 * first (`toldLine`), then the deck as it stands. Cards insert and delete slides, and the author edits between turns, so
 * the slide numbers in earlier turns may name other slides now; the model re-reads rather than trusting them. Empty
 * when no earlier card has an outcome yet, so a turn with nothing to report adds nothing. It goes at the END of the
 * last message so the cached prompt before it is untouched (readiness note §8).
 */
export function toldNote(told: readonly string[], slides: number): string {
	const lines = told.filter(Boolean);
	if (!lines.length) return '';
	return `\n\n(What happened to the edits you proposed earlier, oldest first: ${lines.join(' ')})`; // PROBE: the slide-count sentence dropped on purpose (#34 failing arm); this branch is deleted after the run
	void slides;
}

// The shell-facing pieces (ChatApplyOpts, NO_ENTRY, ChatDraft) live in change-card-types.ts, which imports nothing,
// so the Studio shell can use them without pulling this module, and the slide helpers, into its first load.
export { type ChatApplyOpts, type ChatDraft, NO_ENTRY } from './change-card-types';
