import * as React from 'react';
import type { Finding } from '../architect';
import type { Fix, PhotoVerdict } from '../photo-verdict';

// Keeps the photo verdict (photo-verdict.ts) for the slide on screen. The preview frame renders one slide at a time, so
// the measure is for that slide and follows the author as they move. It runs after the preview has had time to paint (an
// edit re-renders it), loads the reader only for a slide that names a photo, and gives BOTH views the same answer: the
// Coach's `photo-contrast` finding when the text falls under 4.5:1, and the verdict itself, which the editor turns into
// its measured underline and its `thin-card-no-ink` fix. It is not part of the deck's grade: the scorecard is the
// engine's, and this reads pixels.

export const PHOTO_RULE = 'photo-contrast';
export type PhotoFinding = Finding & { pin: Fix | null };

const SETTLE_MS = 900;

/**
 * `context` is everything outside the slide that changes what the preview paints (the site's mode and palette, the deck's
 * front matter): a new value re-reads the slide, so a theme or mode switch cannot leave an old verdict on screen.
 * `slideIndex` is 0-based. `verdict` is null until this slide has been read, and when it cannot be measured.
 */
export function usePhotoContrast(
	chunk: string,
	slideIndex: number,
	source: string,
	context: string,
): { verdict: PhotoVerdict | null; fresh: boolean; findings: PhotoFinding[]; settled: boolean } {
	const [state, setState] = React.useState<{ key: string; slide: number; verdict: PhotoVerdict | null }>({ key: '', slide: -1, verdict: null });
	const photo = /!\[bg[^\]]*\]\(/.test(chunk);
	// Derived in render, so it flips the moment the slide changes: `settled` means the read for THIS slide, in THIS context, has
	// finished (or there is no photo to read).
	const key = `${slideIndex}|${context}|${chunk}`;
	const sourceRef = React.useRef(source);
	sourceRef.current = source;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `context` is not read in the body; a new value is the signal to re-read the preview.
	React.useEffect(() => {
		let live = true;
		if (!photo) {
			setState((prev) => (prev.verdict ? { key: '', slide: -1, verdict: null } : prev));
			return;
		}
		const id = setTimeout(async () => {
			const { readVerdict } = await import('../photo-verdict');
			const verdict = await readVerdict(chunk, sourceRef.current, slideIndex, true, true);
			if (!live) return;
			setState({ key, slide: slideIndex, verdict: verdict?.src === 'live' ? verdict : null });
		}, SETTLE_MS);
		return () => {
			live = false;
			clearTimeout(id);
		};
	}, [chunk, slideIndex, context, photo, key]);
	// While the SAME slide is re-read after an edit, its last verdict stays on screen rather than flickering on every
	// keystroke. A verdict for ANOTHER slide never does: on a slide change it is gone in the same render, so neither view
	// shows the slide you left, with its button hidden, for the second the new read takes.
	const verdict = state.slide === slideIndex ? state.verdict : null;
	const findings: PhotoFinding[] = verdict?.low ? [{ slide: slideIndex + 1, rule: PHOTO_RULE, severity: 'warning', message: verdict.message, pin: verdict.fix }] : [];
	// `fresh`: the verdict is for the slide's CURRENT text. Right after an edit the Coach keeps the last one on screen, but the
	// editor must not draw an underline from it: a fix that just landed would flash its own warning back for a moment.
	return { verdict, fresh: state.key === key, findings, settled: !photo || state.key === key };
}
