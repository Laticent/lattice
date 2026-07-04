import { beforeEach, describe, expect, it } from 'vitest';
import {
	addComment,
	clearComments,
	commentsForSlide,
	deleteComment,
	editComment,
	listComments,
	openCountForSlide,
	setResolved,
} from './slide-comments';

const DECK = 'deck-test';

beforeEach(() => localStorage.clear());

describe('slide-comments store', () => {
	it('adds comments anchored to a slide and lists them per slide', () => {
		addComment(DECK, 2, 'Double-check this number.');
		addComment(DECK, 2, 'Reorder vs slide 4?');
		addComment(DECK, 5, 'The board saw this last quarter.');
		expect(commentsForSlide(DECK, 2)).toHaveLength(2);
		expect(commentsForSlide(DECK, 5)).toHaveLength(1);
		expect(commentsForSlide(DECK, 3)).toHaveLength(0);
		expect(listComments(DECK)).toHaveLength(3);
	});

	it('ignores an empty body', () => {
		expect(addComment(DECK, 1, '   ')).toBeNull();
		expect(listComments(DECK)).toHaveLength(0);
	});

	it('defaults the author and stores a body + timestamp', () => {
		const c = addComment(DECK, 1, 'Note to self');
		expect(c?.author).toBe('You');
		expect(c?.resolved).toBe(false);
		expect(typeof c?.createdAt).toBe('number');
	});

	it('resolves / unresolves and counts only OPEN comments', () => {
		const a = addComment(DECK, 1, 'A');
		addComment(DECK, 1, 'B');
		expect(openCountForSlide(DECK, 1)).toBe(2);
		setResolved(DECK, String(a?.id), true);
		expect(openCountForSlide(DECK, 1)).toBe(1);
		setResolved(DECK, String(a?.id), false);
		expect(openCountForSlide(DECK, 1)).toBe(2);
	});

	it('edits a body; an empty edit deletes the comment', () => {
		const c = addComment(DECK, 1, 'original');
		editComment(DECK, String(c?.id), 'revised');
		expect(commentsForSlide(DECK, 1)[0].body).toBe('revised');
		editComment(DECK, String(c?.id), '   ');
		expect(commentsForSlide(DECK, 1)).toHaveLength(0);
	});

	it('deletes a single comment and clears a deck', () => {
		const a = addComment(DECK, 1, 'A');
		addComment(DECK, 1, 'B');
		deleteComment(DECK, String(a?.id));
		expect(listComments(DECK)).toHaveLength(1);
		clearComments(DECK);
		expect(listComments(DECK)).toHaveLength(0);
	});

	it('scopes comments per deck', () => {
		addComment('deck-a', 1, 'A-only');
		addComment('deck-b', 1, 'B-only');
		expect(listComments('deck-a')).toHaveLength(1);
		expect(listComments('deck-a')[0].body).toBe('A-only');
		expect(listComments('deck-b')[0].body).toBe('B-only');
	});
});
