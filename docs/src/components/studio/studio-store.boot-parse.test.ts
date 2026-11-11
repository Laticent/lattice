// #1930: one Studio boot reads the deck list five times (StudioShell's `decks`, `deck` and
// `source` initializers, the checkpoints, and `loadBootSlide`), and each read used to split
// every deck again. This pins the count, which means the same thing on any machine; the
// wall-clock before/after is in the PR that added it.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const split = vi.hoisted(() => ({ calls: 0 }));
// `loadSource` passes every deck text it reads through this, so its calls count the deck reads.
const reads = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@/lib/normalize-source-text', async (importOriginal) => {
	const real = await importOriginal<typeof import('@/lib/normalize-source-text')>();
	return {
		...real,
		normalizeSourceText: (text: string) => {
			reads.calls++;
			return real.normalizeSourceText(text);
		},
	};
});
vi.mock('../../lib/deck-lint', async (importOriginal) => {
	const real = await importOriginal<typeof import('../../lib/deck-lint')>();
	return {
		...real,
		splitSlides: (src: string) => {
			split.calls++;
			return real.splitSlides(src);
		},
	};
});

import { clearAllDecks, createDeck, deleteDeck, LIST_TITLES_LS, loadBootDeck, loadBootSlide, loadCheckpoints, loadDeckList, SRC_PREFIX, saveSource } from './studio-store';

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

// engineering/decisions/2026-11-11-studio-storage-pointer-records.md §2: naming 40 decks by parsing each
// one's text cost a phone-speed boot ~250 ms. The list now names a saved deck from saveSource's mirror.
describe('the deck list names saved decks without reading them', () => {
	beforeEach(() => localStorage.clear());
	const titleOf = (id: string) => loadDeckList().find((d) => d.id === id)?.title;

	it('reads no saved deck text to build the list', () => {
		const ids = ['One', 'Two', 'Three'].map((t) => {
			const id = createDeck(t).id;
			saveSource(id, `# ${t} renamed\n\n---\n\n## Body`);
			return id;
		});
		reads.calls = 0;
		const list = loadDeckList();
		expect(reads.calls).toBe(0);
		expect(ids.map((id) => list.find((d) => d.id === id)?.title)).toEqual(['One renamed', 'Two renamed', 'Three renamed']);
	});

	it('a deck written around saveSource is read, named from its text, and remembered', () => {
		const id = createDeck('Edited').id;
		saveSource(id, '# Before');
		// What an older build in another tab, or a hand edit, leaves behind.
		localStorage.setItem(SRC_PREFIX + id, JSON.stringify('# After the other tab'));
		reads.calls = 0;
		expect(titleOf(id)).toBe('After the other tab');
		expect(reads.calls).toBeGreaterThan(0);
		reads.calls = 0;
		expect(titleOf(id)).toBe('After the other tab');
		expect(reads.calls, 'recorded on the first read').toBe(0);
	});

	it('a deck with no heading lists under its label, and a deleted deck leaves no title behind', () => {
		const id = createDeck('My label').id;
		saveSource(id, 'no heading here');
		expect(titleOf(id)).toBe('My label');
		deleteDeck(id);
		expect(JSON.parse(localStorage.getItem(LIST_TITLES_LS) ?? '{}')[id]).toBeUndefined();
	});

	it('Clear all removes the titles with the decks', () => {
		saveSource(createDeck('Gone').id, '# Gone');
		clearAllDecks();
		expect(localStorage.getItem(LIST_TITLES_LS)).toBeNull();
	});
});
