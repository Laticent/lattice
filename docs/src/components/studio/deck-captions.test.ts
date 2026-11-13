import { describe, expect, it } from 'vitest';
import { type DeckIndex, deckOutliner } from '@/lib/deck-outline';
import { createFocusHub } from '@/lib/fuoco/hub';
import { builtinDeckCaptions } from './deck-captions';
import { DECKS, deckSource } from './decks';
import { deckCaption, sizeFromSource, sizeRatio } from './slide-size';

// The pre-paint shell states each built-in deck's caption before the app loads. If it ever
// disagrees with what the app then shows, the shell paints a count the app corrects, which the
// shell's contract forbids (StudioChromeSkeleton.tsx, ContentBar). So derive the app's caption the
// way StudioShell does — the focus hub's outline, the full deck, sizeRatio of the front matter — and
// require the build's table to match it for every built-in deck.
describe('builtinDeckCaptions', () => {
	const table = builtinDeckCaptions();
	it('covers every built-in deck', () => {
		expect(Object.keys(table)).toEqual(DECKS.map((d) => d.id));
	});
	for (const d of DECKS) {
		it(`matches the app's caption for ${d.id}`, () => {
			const src = deckSource(d);
			const hub = createFocusHub({ outliner: deckOutliner });
			hub.update(src, { by: 'shell' });
			const ix = hub.outline() as DeckIndex;
			const total = ix.units.reduce((n, u) => n + (u.parts.length ?? 1), 0);
			expect(table[d.id]).toBe(deckCaption(sizeRatio(sizeFromSource(src)), total));
		});
	}
});
