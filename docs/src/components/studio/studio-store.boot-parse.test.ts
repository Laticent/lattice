// #1930: one Studio boot reads the deck list five times (StudioShell's `decks`, `deck` and
// `source` initializers, the checkpoints, and `loadBootSlide`), and each read used to split
// every deck again. This pins the count, which means the same thing on any machine; the
// wall-clock before/after is in the PR that added it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const split = vi.hoisted(() => ({ calls: 0 }));
vi.mock('./lint', async (importOriginal) => {
	const real = await importOriginal<typeof import('./lint')>();
	return {
		...real,
		splitSlides: (src: string) => {
			split.calls++;
			return real.splitSlides(src);
		},
	};
});

import { createDeck, loadBootDeck, loadBootSlide, loadCheckpoints, loadDeckList, saveSource } from './studio-store';

const boot = () => {
	loadDeckList();
	loadBootDeck();
	loadBootDeck();
	loadCheckpoints(loadBootDeck().id);
	loadBootSlide();
};

describe('the Studio boot splits each deck once', () => {
	beforeEach(() => localStorage.clear());

	it('five boot reads split each deck at most once, not five times', () => {
		for (let i = 0; i < 2; i++) saveSource(createDeck(`Deck ${i}`).id, `# Deck ${i}\n\n---\n\n## Two ${i}\n\n---\n\n## Three ${i}`);
		const decks = loadDeckList().length;
		expect(decks).toBeGreaterThan(2);
		split.calls = 0;
		boot();
		// The read above warms the memo, so this boot may split nothing; the bound is the pin. The old
		// code split every deck on each of the five reads (5x decks), which this fails.
		expect(split.calls).toBeLessThanOrEqual(decks);
	});

	it('an edited deck is split again, so the memo never serves stale slides', () => {
		const id = createDeck('Edited').id;
		saveSource(id, '# One\n\n---\n\n## Two');
		expect(loadDeckList().find((d) => d.id === id)?.slides).toHaveLength(2);
		saveSource(id, '# One\n\n---\n\n## Two\n\n---\n\n## Three');
		expect(loadDeckList().find((d) => d.id === id)?.slides).toHaveLength(3);
	});

	it('each read gets its own array, so a caller that splices cannot edit the next read', () => {
		const id = createDeck('Mutated').id;
		saveSource(id, '# One\n\n---\n\n## Two');
		const first = loadDeckList().find((d) => d.id === id);
		first?.slides.splice(0, 2);
		expect(loadDeckList().find((d) => d.id === id)?.slides).toHaveLength(2);
	});
});
