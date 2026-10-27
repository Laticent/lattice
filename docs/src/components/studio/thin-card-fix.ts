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

/** How long a tooltip on the slide on screen waits for the photo to be read before offering both inks. A phone draws the
 *  parked preview and loads the photo far slower than a desktop, so this is generous; "Reading the photo…" shows meanwhile. */
const ON_SCREEN_WAIT_MS = 6000;
/** How long a tooltip for a slide NOT on screen keeps checking before offering both: a tap on a phone can open the tooltip a
 *  moment before its caret move reaches the hub and the preview, and the slide becomes "on screen" just after. */
const OFF_SCREEN_WAIT_MS = 1200;


/**
 * The ink that reads on the photo behind slide `slideIndex`'s card, read from the live preview with the same
 * sampler and kernel as the Card backing slider (card-ink-pick.ts), or null when it cannot be read: the
 * preview shows another slide, the photo will not load, or the browser refuses to read it (cross-origin).
 */
export async function pickedInk(source: string, slideIndex: number): Promise<'light' | 'dark' | null> {
	const chunk = splitSlides(stripFrontMatter(source))[slideIndex];
	if (chunk == null) return null;
	const pick = await import('./card-ink-pick');
	// No cap of its own: the tooltip reads this off the lint pass, and the sampler gives up on a photo that will not load (4 s).
	const behind = await pick.readBehindCard(chunk, slideIndex + 1);
	return behind ? pick.applyLateRead(chunk, source, behind).picked : null;
}

/**
 * The tooltip body for a `thin-card-no-ink` warning: the message, then the fix buttons, built once and filled IN PLACE. A
 * diagnostic's `actions` are fixed when the lint pass runs, so changing them means a new pass and CodeMirror closing the
 * open tooltip; here the buttons arrive in the same node, so the tooltip never closes or changes under the reader.
 *   - it is on screen: a "Reading the photo…" pill until the photo has been read (the preview may still be drawing it),
 *     then the ONE ink that reads; after a wait with no read (a cross-origin photo), both;
 *   - it is not on screen (the preview cannot show its photo): both inks, after a short check in case the caret is on its way.
 * The row holds a placeholder pill of the buttons' own class from the first frame, so the tooltip opens at its final height:
 * a row that started empty grew when the ink arrived, and CodeMirror then moved the taller tooltip to fit (two visible jumps).
 */
export function inkFixNode(
	message: string,
	h: { slideOf: () => number; source: () => string; onApply: (next: string) => void; onScreen: () => boolean },
): HTMLElement {
	const root = document.createElement('div');
	const text = document.createElement('div');
	text.textContent = message;
	const row = document.createElement('div');
	// The pill turns into the fix button in place; say so to a screen reader too.
	row.setAttribute('aria-live', 'polite');
	const reading = document.createElement('button');
	reading.type = 'button';
	reading.className = 'cm-diagnosticAction';
	reading.textContent = 'Reading the photo…';
	reading.disabled = true;
	reading.setAttribute('aria-busy', 'true');
	reading.style.opacity = '0.6';
	row.append(reading);
	root.append(text, row);
	const add = (ink: 'light' | 'dark') => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'cm-diagnosticAction';
		b.textContent = `Add ink-${ink}`;
		b.setAttribute('aria-label', `Action: Add ink-${ink}`);
		// Keep focus (and the caret) in the editor, as CodeMirror's own action buttons do.
		b.onmousedown = (e) => e.preventDefault();
		b.onclick = () => {
			const next = addCardInk(h.source(), h.slideOf(), ink);
			if (next != null) h.onApply(next);
		};
		row.append(b);
	};
	const started = Date.now();
	const done = () => reading.remove();
	void (async () => {
		for (;;) {
			const here = h.onScreen();
			// A read never runs past the window: one that starts late gets only what is left of it.
			const left = (here ? ON_SCREEN_WAIT_MS : OFF_SCREEN_WAIT_MS) - (Date.now() - started);
			const ink = here && left > 0 ? await Promise.race([pickedInk(h.source(), h.slideOf()).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), left))]) : null;
			if (ink) {
				done();
				return add(ink);
			}
			if (Date.now() - started >= (here ? ON_SCREEN_WAIT_MS : OFF_SCREEN_WAIT_MS)) {
				done();
				return both();
			}
			await new Promise((r) => setTimeout(r, 250));
		}
	})();
	function both() {
		add('light');
		add('dark');
	}
	return root;
}
