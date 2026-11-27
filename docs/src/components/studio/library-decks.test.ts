import { describe, expect, it } from 'vitest';
import { hasSlides } from './library-deck-ref';
import { deckIdsOf, landingAfterSave, maybeMarkdownDeck } from './library-decks';

const rec = (over: Record<string, unknown>) => ({ id: 'x', name: 'a.md', docKind: 'text' as const, text: '', ...over });

describe('Decks section membership (followups.d/3356-p1)', () => {
	it('lists a kept deck file whatever its kind', async () => {
		const ids = await deckIdsOf([rec({ id: 'lat', name: 'q3.lattice', deck: new Blob(['zip']) }), rec({ id: 'pdf', name: 'q3.pdf', docKind: 'pdf', deck: new Blob(['%PDF-']) })]);
		expect([...ids].sort()).toEqual(['lat', 'pdf']);
	});

	it('lists a byte-exact Markdown file only when it has slides, using the import rule', async () => {
		const docs = [
			rec({ id: 'front', sourceExact: true, text: '---\ntheme: indaco\n---\n\n# One' }),
			rec({ id: 'break', sourceExact: true, text: '# One\n\n---\n\n# Two' }),
			rec({ id: 'notes', sourceExact: true, text: '# Notes\n\nNo slides here.' }),
		];
		const ids = await deckIdsOf(docs);
		expect([...ids].sort()).toEqual(['break', 'front']);
		// The same verdicts the import reached, so the two can never disagree.
		for (const d of docs) expect(ids.has(d.id)).toBe(await hasSlides(d.text));
	});

	it('never lists a .txt, a PDF reference or a Markdown file whose text is not the file', async () => {
		const slides = '# One\n\n---\n\n# Two';
		expect(maybeMarkdownDeck(rec({ name: 'talk.txt', sourceExact: true, text: slides }))).toBe(false);
		expect(maybeMarkdownDeck(rec({ name: 'brief.pdf', docKind: 'pdf', text: undefined }))).toBe(false);
		expect(maybeMarkdownDeck(rec({ name: 'cut.md', text: slides }))).toBe(false);
		expect((await deckIdsOf([rec({ name: 'talk.txt', sourceExact: true, text: slides })])).size).toBe(0);
	});

	it('keeps Markdown under Files when the slide test cannot load', async () => {
		const ids = await deckIdsOf([rec({ id: 'md', sourceExact: true, text: '# A\n\n---\n\n# B' }), rec({ id: 'lat', name: 'q.lattice', deck: new Blob(['z']) })], () => Promise.reject(new Error('stale chunk')));
		expect([...ids]).toEqual(['lat']);
	});

	it('loads the slide test only when a Markdown file needs it', async () => {
		let loads = 0;
		await deckIdsOf([rec({ id: 'lat', name: 'q.lattice', deck: new Blob(['z']) })], async () => {
			loads++;
			return { hasSlides: async () => true };
		});
		expect(loads).toBe(0);
	});
});

describe('landingAfterSave (where an import lands once its files are read)', () => {
	it('moves a PowerPoint kept as text from Decks to Files, and Markdown decks from Files to Decks', () => {
		// A .pptx not made in Lattice: landingFilter guessed Decks; it was saved as reference text.
		expect(landingAfterSave('deck', 1, 0)).toBe('refdoc');
		// A Markdown deck: landingFilter guessed Files; it has slides.
		expect(landingAfterSave('refdoc', 2, 2)).toBe('deck');
		expect(landingAfterSave('deck', 2, 1)).toBe('all');
	});
	it('leaves a section the person moved to, and a batch where nothing was saved', () => {
		expect(landingAfterSave('image', 1, 0)).toBe('image');
		expect(landingAfterSave('all', 1, 1)).toBe('all');
		expect(landingAfterSave('deck', 0, 0)).toBe('deck');
	});
});
