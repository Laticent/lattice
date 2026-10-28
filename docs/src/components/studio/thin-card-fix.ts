import type { Diagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { buildDeckIndex } from '@/lib/deck-outline';
import { unitAt } from '@/lib/fuoco/outline';
import { replaceSlide } from './deck-ops';
import { stripFrontMatter } from './front-matter';
import { slideRanges, splitSlides } from './lint';
import { cachedFix, cardOf } from './photo-ink-read';
import { applyFix, cardPolicy, type Fix, fixLabel, type PhotoVerdict, readVerdict } from './photo-verdict';
import { canEditClass } from './slide-directives';

// The editor's view of the photo verdict (photo-verdict.ts), the one answer the Coach shows too:
//   - the `thin-card-no-ink` tooltip: lint's warning is instant and knows nothing about the picture; the tooltip then
//     shows the verdict's ONE fix (the ink that reads, or a solid card), and once the slide is measured, the Coach's
//     own message;
//   - the measured `photo-contrast` underline (`photoDiagnostic`): text on a photo under 4.5:1 on the slide on screen,
//     where lint flags nothing (a statement, a card that already names an ink), with the same message and button as
//     the Coach's finding.
// Both buttons make the verdict's edit (`applyFix`), so a fix means the same thing wherever it is clicked. Loaded when
// a photo warning is linted or measured, never on the shell's path.

/** What the editor knows about the slide on screen: its index and its measured verdict (StudioShell, `measuredPhoto`). */
export type MeasuredPhoto = { slideIndex: number; verdict: PhotoVerdict } | null;

/**
 * The deck with `fix` applied to slide `slideIndex` (0-based, front matter not counted), or null when that slide cannot
 * take it: no such slide, a `_class` the Studio cannot edit, or nothing would change. Only that slide's text changes
 * (deck-ops.ts `replaceSlide`).
 */
export function applyFixAt(source: string, slideIndex: number, fix: Fix): string | null {
	const chunk = splitSlides(stripFrontMatter(source))[slideIndex];
	if (chunk == null) return null;
	const next = applyFix(chunk, fix);
	if (next === chunk) return null;
	const out = replaceSlide(source, slideIndex, next).source;
	return out === source ? null : out;
}

/** The deck with `ink-<ink>` set on slide `slideIndex`, or null (see `applyFixAt`). */
export function addCardInk(source: string, slideIndex: number, ink: 'light' | 'dark'): string | null {
	return applyFixAt(source, slideIndex, `ink-${ink}`);
}

/**
 * Apply a whole new document as the ONE span that changed. Replacing the whole document maps the caret to its end, so the
 * preview would follow it to the last slide (the jump engineering/gotchas/studio-playground.md describes); a minimal span
 * keeps the caret where it was.
 */
export function applyAsSpan(v: EditorView, next: string): void {
	const old = v.state.doc.toString();
	let p = 0;
	const max = Math.min(old.length, next.length);
	while (p < max && old.charCodeAt(p) === next.charCodeAt(p)) p++;
	let s = 0;
	while (s < max - p && old.charCodeAt(old.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
	v.dispatch({ changes: { from: p, to: old.length - s, insert: next.slice(p, next.length - s) } });
}

type Handles = { slideOf: () => number; source: () => string; onApply: (next: string) => void; onScreen: () => boolean; measured: () => MeasuredPhoto };

/** One fix button, in CodeMirror's own action style, that keeps focus (and the caret) in the editor as its buttons do. */
function fixButton(label: string, edit: () => string | null, apply: (next: string) => void): HTMLButtonElement {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'cm-diagnosticAction';
	b.textContent = label;
	b.setAttribute('aria-label', `Action: ${label}`);
	b.onmousedown = (e) => e.preventDefault();
	b.onclick = () => {
		const next = edit();
		if (next != null) apply(next);
	};
	return b;
}

/** The measured verdict for slide `slideIndex`, when the slide on screen is that slide and has been read. */
function measuredFor(h: Handles, slideIndex: number): PhotoVerdict | null {
	const m = h.measured();
	return m && m.slideIndex === slideIndex ? m.verdict : null;
}

/**
 * The tooltip body for a photo warning: a message, then ONE fix, filled in place.
 *   - the slide on screen already measured: the verdict's message and fix, on the first frame;
 *   - a fix already found for this photo (kept in the browser): that fix at once, upgraded if the measured read differs;
 *   - otherwise a disabled "Checking the photo…" pill while the verdict is read, replaced by the fix in the same row.
 * When the photo cannot be read, a spotlight's fix is a solid card, which always reads, with a short note saying why.
 * The row is one line from the first frame (the note truncates rather than wraps), so the tooltip opens at its final
 * size: an earlier row that started empty grew when the fix arrived, and CodeMirror then moved the tooltip.
 */
export function inkFixNode(message: string, h: Handles): HTMLElement {
	const root = document.createElement('div');
	const text = document.createElement('div');
	const row = document.createElement('div');
	row.style.display = 'flex';
	row.style.alignItems = 'center';
	row.style.gap = '0.5em';
	row.style.minWidth = '0';
	// The pill turns into the fix in place; say so to a screen reader too.
	row.setAttribute('aria-live', 'polite');
	root.append(text, row);

	const note = (words: string) => {
		const n = document.createElement('span');
		n.textContent = words;
		n.style.opacity = '0.7';
		n.style.whiteSpace = 'nowrap';
		n.style.overflow = 'hidden';
		n.style.textOverflow = 'ellipsis';
		n.style.minWidth = '0';
		row.append(n);
	};
	const show = (v: { fix: Fix | null; src: 'live' | 'estimate' } | null) => {
		row.textContent = '';
		const chunkNow = splitSlides(stripFrontMatter(h.source()))[h.slideOf()] ?? '';
		// No answer: a solid card, which always reads, where it does (a spotlight; a statement's scrim fades out under its words).
		const fix = v ? v.fix : cardPolicy(chunkNow, h.source()).solidReads ? 'solid' : null;
		// A `_class` the Studio cannot edit takes no fix (the Coach hides its button there too): a button that does nothing on
		// click is worse than none.
		if (fix && canEditClass(chunkNow)) row.append(fixButton(fixLabel(fix), () => applyFixAt(h.source(), h.slideOf(), fix), h.onApply));
		if (!v) note('Could not read this photo.');
		else if (!v.fix) note('No fix here clears it.');
		else if (v.fix === 'solid') note('No ink reads on this photo.');
		else if (v.src === 'estimate') note('Estimated from the photo file.');
	};

	const slideIndex = h.slideOf();
	const measured = measuredFor(h, slideIndex);
	// The measured message is the Coach's, word for word. Lint's stays until the slide is measured: changing the words
	// after the tooltip opened would resize it.
	text.textContent = measured?.low ? measured.message : message;
	if (measured) {
		show(measured);
		return root;
	}
	const chunk = splitSlides(stripFrontMatter(h.source()))[slideIndex] ?? '';
	const card = cardOf(chunk, h.source());
	const kept = card.ref ? cachedFix({ ...card, ref: card.ref }) : undefined;
	if (kept) {
		show({ fix: kept.fix, src: kept.src });
		// A kept answer shows at once; when the preview shows this slide, the measured read replaces it, and the button
		// changes only if the measured fix differs.
		if (h.onScreen())
			void readVerdict(chunk, h.source(), slideIndex, true).then((v) => {
				if (v && v.fix !== kept.fix) show(v);
			}, () => {});
		return root;
	}
	const checking = document.createElement('button');
	checking.type = 'button';
	checking.className = 'cm-diagnosticAction';
	checking.textContent = 'Checking the photo…';
	checking.disabled = true;
	checking.setAttribute('aria-busy', 'true');
	checking.style.opacity = '0.6';
	row.append(checking);
	void readVerdict(chunk, h.source(), slideIndex, h.onScreen()).then(show, () => show(null));
	return root;
}

export { keepTooltipOnSameDiagnostics } from './lint-tooltip-keep';

/**
 * Give each `thin-card-no-ink` diagnostic its tooltip body (`inkFixNode`) and drop lint's "Fix: …" prose, since a button
 * does the fix (#1658). `text` is the document the diagnostics were built from; `focusUnit` is the slide the hub says is
 * on screen; `measured` is the verdict for it. Lives here, not in the editor, so none of it rides the editor's startup chunk.
 */
export function attachInkFixes(diags: Diagnostic[], text: string, focusUnit: () => number | undefined, measured: () => MeasuredPhoto): void {
	const ix = buildDeckIndex(text);
	for (const d of diags) {
		const message = d.message.split('\n\nFix:')[0];
		const at = d.from;
		const slide = Math.max(0, unitAt(ix, at));
		d.message = message;
		d.renderMessage = (v: EditorView) =>
			inkFixNode(message, {
				slideOf: () => Math.max(0, unitAt(buildDeckIndex(v.state.doc.toString()), at)),
				source: () => v.state.doc.toString(),
				onApply: (next) => applyAsSpan(v, next),
				onScreen: () => focusUnit() === slide,
				measured,
			});
	}
}

/**
 * The measured `photo-contrast` underline for the slide on screen, on its `![bg](…)` line, or null when the verdict
 * passes or the line cannot be found. The editor adds it only where lint flags nothing on that slide: where lint does,
 * the `thin-card-no-ink` tooltip already carries this verdict.
 */
export function photoDiagnostic(doc: Text, m: NonNullable<MeasuredPhoto>, measured: () => MeasuredPhoto): Diagnostic | null {
	if (!m.verdict.low) return null;
	const text = doc.toString();
	const body = stripFrontMatter(text);
	const r = slideRanges(body)[m.slideIndex];
	if (!r) return null;
	const at = text.length - body.length + r.from;
	// The `![bg]` the slide renders: not one quoted in a comment or a code fence, which are blanked first (same length, so the
	// offsets hold).
	const slideText = text
		.slice(at, at + (r.to - r.from))
		.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
		.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gm, (m) => m.replace(/[^\n]/g, ' '));
	const bg = /!\[bg[^\]]*\]\(/.exec(slideText);
	if (!bg) return null;
	const line = doc.lineAt(at + bg.index);
	const message = m.verdict.message;
	const slide = m.slideIndex;
	return {
		from: line.from + (line.text.length - line.text.trimStart().length),
		to: line.to,
		severity: 'warning',
		source: 'photo-contrast',
		message,
		renderMessage: (v: EditorView) =>
			inkFixNode(message, {
				slideOf: () => slide,
				source: () => v.state.doc.toString(),
				onApply: (next) => applyAsSpan(v, next),
				onScreen: () => true,
				measured,
			}),
	};
}
