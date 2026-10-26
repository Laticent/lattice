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

export function usePhotoContrast(chunk: string, slideNumber: number, enabled: boolean): PhotoFinding[] {
	const [found, setFound] = React.useState<PhotoFinding[]>([]);
	React.useEffect(() => {
		let live = true;
		const photo = enabled && /!\[bg[^\]]*\]\(/.test(chunk);
		if (!photo) {
			setFound((prev) => (prev.length ? [] : prev));
			return;
		}
		const id = setTimeout(async () => {
			const [{ readPhotoContrast }, { headingOf, photoRefOf }] = await Promise.all([import('./photo-contrast-read'), import('../card-ink-pick')]);
			const read = await readPhotoContrast(slideNumber, headingOf(chunk), photoRefOf(chunk), getClassTokens(chunk));
			if (!live) return;
			setFound(read ? [{ slide: slideNumber, rule: PHOTO_RULE, severity: 'warning', message: read.message, pin: read.fix }] : []);
		}, SETTLE_MS);
		return () => {
			live = false;
			clearTimeout(id);
		};
	}, [chunk, slideNumber, enabled]);
	return found;
}
