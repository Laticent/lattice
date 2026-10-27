import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { buildDeckIndex } from '@/lib/deck-outline';
import { unitAt } from '@/lib/fuoco/outline';
import { replaceSlide } from './deck-ops';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { cachedVerdict, cardOf, type InkVerdict, readPhotoInk } from './photo-ink-read';
import { setImageCard } from './slide-provenance';

// The edits behind the `thin-card-no-ink` tooltip, and the tooltip body itself. The warning is lint's and is instant; the
// photo read (photo-ink-read.ts) runs only when the tooltip opens, says it is checking, and then offers ONE fix: the ink that
// reads, or a solid card when neither ink does or the photo cannot be read. Loaded when a thin card is linted, never on the
// shell's path.

/**
 * The deck with `ink-<ink>` set on slide `slideIndex` (0-based, front matter not counted), or null when
 * that slide cannot take it: no such slide, a `_class` the Studio cannot edit, or an edit the deck
 * operations refuse.
 */
export function addCardInk(source: string, slideIndex: number, ink: 'light' | 'dark'): string | null {
	const chunk = splitSlides(stripFrontMatter(source))[slideIndex];
	if (chunk == null) return null;
	const next = setImageCard(chunk, 'ink', ink);
	if (next === chunk) return null;
	const out = replaceSlide(source, slideIndex, next).source;
	return out === source ? null : out;
}

/**
 * The deck with slide `slideIndex`'s card made solid (`card-solid`), or null when that slide cannot take it. A solid card
 * carries the theme's own contrast whatever the photo is, so it is the fix that always reads.
 */
export function useSolidCard(source: string, slideIndex: number): string | null {
	const chunk = splitSlides(stripFrontMatter(source))[slideIndex];
	if (chunk == null) return null;
	const next = setImageCard(chunk, 'backing', 'solid');
	if (next === chunk) return null;
	const out = replaceSlide(source, slideIndex, next).source;
	return out === source ? null : out;
}

type Handles = { slideOf: () => number; source: () => string; onApply: (next: string) => void; onScreen: () => boolean };

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

/**
 * The tooltip body for a `thin-card-no-ink` warning: lint's message, then ONE fix, filled in place.
 *   - a photo already read (the answer is kept in the browser, so a reload does not ask again): the fix, on the first frame;
 *   - otherwise a disabled "Checking the photo…" pill while photo-ink-read.ts reads it, replaced by the fix in the same row:
 *       · an ink reads: "Add ink-light" (or dark);
 *       · neither reads, or the photo cannot be read: "Use a solid card", with a short note saying which.
 * Never both inks. The row is one line from the first frame (the note truncates rather than wraps), so the tooltip opens at
 * its final size: an earlier row that started empty grew when the fix arrived, and CodeMirror then moved the tooltip.
 */
export function inkFixNode(message: string, h: Handles): HTMLElement {
	const root = document.createElement('div');
	const text = document.createElement('div');
	text.textContent = message;
	const row = document.createElement('div');
	row.style.display = 'flex';
	row.style.alignItems = 'center';
	row.style.gap = '0.5em';
	row.style.minWidth = '0';
	// The pill turns into the fix in place; say so to a screen reader too.
	row.setAttribute('aria-live', 'polite');
	root.append(text, row);

	const show = (v: InkVerdict) => {
		row.textContent = '';
		const source = h.source;
		if (v.kind === 'ink') {
			const ink = v.ink;
			row.append(fixButton(`Add ink-${ink}`, () => addCardInk(source(), h.slideOf(), ink), h.onApply));
			return;
		}
		row.append(fixButton('Use a solid card', () => useSolidCard(source(), h.slideOf()), h.onApply));
		const note = document.createElement('span');
		note.textContent = v.kind === 'neither' ? 'No ink reads on this photo.' : 'Could not read this photo.';
		note.style.opacity = '0.7';
		note.style.whiteSpace = 'nowrap';
		note.style.overflow = 'hidden';
		note.style.textOverflow = 'ellipsis';
		note.style.minWidth = '0';
		row.append(note);
	};

	const slideIndex = h.slideOf();
	const chunk = splitSlides(stripFrontMatter(h.source()))[slideIndex] ?? '';
	const card = cardOf(chunk, h.source());
	const kept = card.ref ? cachedVerdict(card.ref, card.placement, card.backing) : undefined;
	if (kept) {
		show(kept);
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
	void readPhotoInk(chunk, h.source(), slideIndex, h.onScreen()).then(show, () => show({ kind: 'unknown' }));
	return root;
}

export { keepTooltipOnSameDiagnostics } from './lint-tooltip-keep';

/**
 * Give each `thin-card-no-ink` diagnostic its tooltip body (`inkFixNode`) and drop lint's "Fix: …" prose, since buttons do the
 * fix (#1658). `text` is the document the diagnostics were built from; `focusUnit` is the slide the hub says is on screen.
 * Lives here, not in the editor, so none of it rides the editor's startup chunk.
 */
export function attachInkFixes(diags: Diagnostic[], text: string, focusUnit: () => number | undefined): void {
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
				onApply: (next) => v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: next } }),
				onScreen: () => focusUnit() === slide,
			});
	}
}
