import { replaceSlide } from './deck-ops';
import { stripFrontMatter } from './front-matter';
import { splitSlides } from './lint';
import { setImageCard } from './slide-provenance';

// The edit and the pick behind the `thin-card-no-ink` tooltip's buttons. Lint cannot see the photo, so the Studio
// reads it from the live preview (`pickedInk`) and offers the ink that reads; when it cannot, the tooltip offers
// `Add ink-light` and `Add ink-dark` and the author chooses. Loaded when a thin card is linted, never on the shell's path.

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

const READ_CAP_MS = 1200;
/** How long a tooltip on the slide on screen waits for the preview to have drawn its photo before offering both inks. */
const READ_WAIT_MS = 3000;

/**
 * The ink that reads on the photo behind slide `slideIndex`'s card, read from the live preview with the same
 * sampler and kernel as the Card backing slider (card-ink-pick.ts), or null when it cannot be read: the
 * preview shows another slide, the photo will not load, or the browser refuses to read it (cross-origin).
 */
export async function pickedInk(source: string, slideIndex: number): Promise<'light' | 'dark' | null> {
	const chunk = splitSlides(stripFrontMatter(source))[slideIndex];
	if (chunk == null) return null;
	const pick = await import('./card-ink-pick');
	// A slow or dead photo host must not hold the lint pass: past the cap, offer both inks.
	const behind = await Promise.race([pick.readBehindCard(chunk, slideIndex + 1), new Promise<null>((r) => setTimeout(() => r(null), READ_CAP_MS))]);
	return behind ? pick.applyLateRead(chunk, source, behind).picked : null;
}

/**
 * The tooltip body for a `thin-card-no-ink` warning: the message, then the fix buttons, built once and filled IN PLACE. A
 * diagnostic's `actions` are fixed when the lint pass runs, so changing them means a new pass and CodeMirror closing the
 * open tooltip; here the buttons arrive in the same node, so the tooltip never closes or changes under the reader.
 *   - the slide is not the one on screen (the preview cannot show its photo): both inks at once, the author picks;
 *   - it is on screen: nothing until the photo has been read (the preview may still be drawing it), then the ONE ink that
 *     reads; after a short wait with no read (a cross-origin photo), both.
 */
export function inkFixNode(
	message: string,
	h: { slideOf: () => number; source: () => string; onApply: (next: string) => void; onScreen: () => boolean },
): HTMLElement {
	const root = document.createElement('div');
	const text = document.createElement('div');
	text.textContent = message;
	const row = document.createElement('div');
	root.append(text, row);
	const add = (ink: 'light' | 'dark') => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'cm-diagnosticAction';
		b.textContent = `Add ink-${ink}`;
		// Keep focus (and the caret) in the editor, as CodeMirror's own action buttons do.
		b.onmousedown = (e) => e.preventDefault();
		b.onclick = () => {
			const next = addCardInk(h.source(), h.slideOf(), ink);
			if (next != null) h.onApply(next);
		};
		row.append(b);
	};
	void (async () => {
		if (!h.onScreen()) return both();
		const until = Date.now() + READ_WAIT_MS;
		for (;;) {
			const ink = await pickedInk(h.source(), h.slideOf()).catch(() => null);
			if (ink) return add(ink);
			if (Date.now() >= until) return both();
			await new Promise((r) => setTimeout(r, 250));
		}
	})();
	function both() {
		add('light');
		add('dark');
	}
	return root;
}
