import { beforeEach, describe, expect, it } from 'vitest';
import { buildCommentAnnotations, commentCount } from './export-options';
import { addComment, setResolved } from './slide-comments';

const DECK = 'deck-eo';

beforeEach(() => localStorage.clear());

describe('export-options — comment → PDF sticky-note payload', () => {
	it('groups comments onto their 1-based slide page (page index = slide - 1)', () => {
		addComment(DECK, 1, 'On the opener');
		addComment(DECK, 3, 'Third slide');
		addComment(DECK, 3, 'Also third');
		const ann = buildCommentAnnotations(DECK, 'all');
		expect(ann[0]).toHaveLength(1); // slide 1 → page 0
		expect(ann[0][0].contents).toBe('On the opener');
		expect(ann[1]).toBeUndefined(); // slide 2 → no notes
		expect(ann[2]).toHaveLength(2); // slide 3 → page 2
	});

	it('scope "open" drops resolved comments; "all" keeps them (and tags them)', () => {
		const a = addComment(DECK, 1, 'Keep me open');
		const b = addComment(DECK, 1, 'I am resolved');
		setResolved(DECK, String(b?.id), true);

		const open = buildCommentAnnotations(DECK, 'open');
		expect(open[0]).toHaveLength(1);
		expect(open[0][0].contents).toBe('Keep me open');

		const all = buildCommentAnnotations(DECK, 'all');
		expect(all[0]).toHaveLength(2);
		// A resolved comment is tagged in its sticky-note title.
		const resolved = all[0].find((n) => n.contents === 'I am resolved');
		expect(resolved?.title).toMatch(/resolved/i);
		expect(a?.id).toBeTruthy();
	});

	it('commentCount reflects the scope', () => {
		addComment(DECK, 1, 'x');
		const r = addComment(DECK, 2, 'y');
		setResolved(DECK, String(r?.id), true);
		expect(commentCount(DECK, 'all')).toBe(2);
		expect(commentCount(DECK, 'open')).toBe(1);
	});

	it('is empty for a deck with no comments or no deckId', () => {
		expect(buildCommentAnnotations(DECK, 'all')).toEqual([]);
		expect(buildCommentAnnotations(undefined, 'all')).toEqual([]);
		expect(commentCount(undefined, 'all')).toBe(0);
	});

	it('drops a stale comment anchored past the deck length — count matches what is embedded', () => {
		// A comment left on slide 5, then the deck shortened to 3 slides (index-anchoring
		// limit). The stale anchor has no page — it must be dropped from BOTH the count
		// and the payload, so the panel's "N notes" can never over-promise the PDF.
		addComment(DECK, 1, 'valid');
		addComment(DECK, 5, 'orphaned by a later delete');
		// Without the bound, the old behavior over-counted (2) and silently dropped one.
		expect(commentCount(DECK, 'all', 3)).toBe(1);
		const ann = buildCommentAnnotations(DECK, 'all', 3);
		expect(ann.flat().filter(Boolean)).toHaveLength(1);
		expect(ann[4]).toBeUndefined(); // slide 5 never placed
		// Unbounded (no slideCount) keeps the prior behavior for callers that don't pass it.
		expect(commentCount(DECK, 'all')).toBe(2);
	});
});
