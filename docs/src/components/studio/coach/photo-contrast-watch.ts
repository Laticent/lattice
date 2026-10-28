import * as React from 'react';
import type { Finding } from '../architect';
import { getClassTokens } from '../slide-directives';
import type { Pin } from './photo-contrast-read';

// Keeps the Coach's photo-contrast finding for the slide on screen. The preview frame renders one
// slide at a time, so the measure is for that slide and follows the author as they move. It runs
// after the preview has had time to paint (an edit re-renders it), loads the reader only for a
// slide that names a photo, and returns a finding only when the text does not reach 4.5:1.
// It is not part of the deck's grade: the scorecard is the engine's, and this reads pixels.

export const PHOTO_RULE = 'photo-contrast';
export type PhotoFinding = Finding & { pin: Pin | null };

const SETTLE_MS = 900;

/**
 * `context` is everything outside the slide that changes what the preview paints (the site's mode and palette, the deck's
 * front matter): a new value re-reads the slide, so a theme or mode switch cannot leave an old verdict on screen.
 */
export function usePhotoContrast(chunk: string, slideNumber: number, enabled: boolean, context: string): { findings: PhotoFinding[]; settled: boolean } {
	const [state, setState] = React.useState<{ key: string; list: PhotoFinding[] }>({ key: '', list: [] });
	const photo = enabled && /!\[bg[^\]]*\]\(/.test(chunk);
	// Derived in render, so it flips the moment the slide changes: `settled` means the read for THIS slide, in THIS context, has
	// finished (or there is no photo to read). The old finding stays on screen meanwhile rather than flickering on every keystroke.
	const key = `${slideNumber}|${context}|${chunk}`;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `context` is not read in the body; a new value is the signal to re-read the preview.
	React.useEffect(() => {
		let live = true;
		if (!photo) {
			setState((prev) => (prev.list.length ? { key: '', list: [] } : prev));
			return;
		}
		const id = setTimeout(async () => {
			const [{ readPhotoContrast }, { headingOf, photoRefOf }] = await Promise.all([import('./photo-contrast-read'), import('../card-ink-pick')]);
			const read = await readPhotoContrast(slideNumber, headingOf(chunk), photoRefOf(chunk), getClassTokens(chunk));
			if (!live) return;
			setState({ key, list: read ? [{ slide: slideNumber, rule: PHOTO_RULE, severity: 'warning', message: read.message, pin: read.fix }] : [] });
		}, SETTLE_MS);
		return () => {
			live = false;
			clearTimeout(id);
		};
	}, [chunk, slideNumber, enabled, context, photo, key]);
	return { findings: state.list, settled: !photo || state.key === key };
}
