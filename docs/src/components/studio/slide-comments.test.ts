import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	addComment,
	clearComments,
	commentsForSlide,
	deleteComment,
	editComment,
	importComments,
	listComments,
	mayDeleteComment,
	mergeSessionComments,
	openCountForSlide,
	setCommentRelay,
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

	it('drops malformed stored entries instead of rendering "NaNd ago" / empty bubbles', () => {
		// A hand-corrupted store: one valid comment, plus entries missing the
		// display-critical fields (createdAt/body/resolved). Only the valid one survives.
		const good = { id: 'ok', slide: 1, author: 'You', body: 'real', createdAt: 1000, resolved: false };
		const bad = [
			{ id: 'a', slide: 1 }, // missing everything downstream
			{ id: 'b', slide: 1, author: 'You', body: 'x', createdAt: undefined, resolved: false },
			{ id: 'c', slide: 1, author: 'You', body: 42, createdAt: 1, resolved: false },
		];
		localStorage.setItem('lattice-studio-comments-corrupt', JSON.stringify([good, ...bad]));
		const got = listComments('corrupt');
		expect(got).toHaveLength(1);
		expect(got[0].id).toBe('ok');
	});

	it('importComments restores a .lattice payload, dropping malformed entries', () => {
		const good = { id: 'ok', slide: 1, author: 'You', body: 'real', createdAt: 1000, resolved: false };
		const bad = { id: 'x', slide: 1 }; // missing display-critical fields
		const n = importComments(DECK, [good, bad]);
		expect(n).toBe(1);
		expect(listComments(DECK)).toHaveLength(1);
		expect(listComments(DECK)[0].body).toBe('real');
		// An empty/invalid payload clears the deck's comments.
		expect(importComments(DECK, [])).toBe(0);
		expect(listComments(DECK)).toHaveLength(0);
		expect(importComments(DECK, 'nonsense')).toBe(0);
	});

	it('clearComments removes the storage key entirely (no orphaned empty array)', () => {
		addComment(DECK, 1, 'A');
		expect(localStorage.getItem('lattice-studio-comments-' + DECK)).not.toBeNull();
		clearComments(DECK);
		// The key is gone, not left as "[]" — a deleted deck leaks nothing.
		expect(localStorage.getItem('lattice-studio-comments-' + DECK)).toBeNull();
		expect(listComments(DECK)).toHaveLength(0);
	});
});

// A live session's hold on a deck's comments (2026-10-20 live note, slice 6).
describe('slide-comments in a live session', () => {
	afterEach(() => setCommentRelay(null));
	const relay = (mayDelete: (id: string) => boolean = () => true) => {
		const log: string[] = [];
		setCommentRelay({ deckId: DECK, added: (c) => log.push(`add ${c.body}`), resolved: (id, r) => log.push(`resolve ${id} ${r}`), deleted: (id) => log.push(`del ${id}`), mayDelete });
		return log;
	};

	it("reports this person's own adds, resolves and deletes on the session's deck, and nothing on another deck", () => {
		const log = relay();
		const c = addComment(DECK, 1, 'Check the source');
		setResolved(DECK, String(c?.id), true);
		deleteComment(DECK, String(c?.id));
		addComment('another-deck', 1, 'Elsewhere');
		expect(log).toEqual(['add Check the source', `resolve ${c?.id} true`, `del ${c?.id}`]);
	});

	it("does not delete someone else's shared comment", () => {
		const c = addComment(DECK, 1, 'Their note');
		const log = relay((id) => id !== c?.id);
		expect(mayDeleteComment(DECK, String(c?.id))).toBe(false);
		deleteComment(DECK, String(c?.id));
		expect(listComments(DECK)).toHaveLength(1);
		expect(log).toEqual([]);
	});

	it('takes what the session sends without reporting it back, and drops a malformed one', () => {
		const mine = addComment(DECK, 1, 'Mine');
		const log = relay();
		mergeSessionComments(DECK, [{ id: 'mine-shared', slide: 1, author: 'You', body: 'x', createdAt: 5, resolved: false, owner: 'me' }], [], 'me');
		mergeSessionComments(DECK, [{ id: 's1', slide: 2, author: 'Amina', body: 'Shared', createdAt: 5, resolved: false, owner: 'amina' }, { id: 's2', slide: 0, author: 'x', body: 'bad slide', createdAt: 5, resolved: false, owner: 'x' }], [{ id: String(mine?.id), owner: 'me' }], 'me');
		expect(listComments(DECK).map((c) => c.id)).toEqual(['mine-shared', 's1']);
		expect(log).toEqual([]);
	});

	it("never lets someone else's word take over a comment this copy holds under another owner, or one never shared", () => {
		const own = addComment(DECK, 1, 'My private note');
		mergeSessionComments(DECK, [{ id: 'old1', slide: 2, author: 'Amina', body: 'Check the number', createdAt: 5, resolved: false, owner: 'amina' }], [], 'me');
		// Mallory re-adds both ids under her own ownership, then deletes them.
		mergeSessionComments(DECK, [{ id: 'old1', slide: 2, author: 'Mallory', body: 'FORGED', createdAt: 6, resolved: false, owner: 'mallory' }, { id: String(own?.id), slide: 1, author: 'Mallory', body: 'FORGED', createdAt: 6, resolved: false, owner: 'mallory' }], [], 'me');
		mergeSessionComments(DECK, [], [{ id: 'old1', owner: 'mallory' }, { id: String(own?.id), owner: 'mallory' }], 'me');
		const held = listComments(DECK);
		expect(held.map((c) => c.body).sort()).toEqual(['Check the number', 'My private note']);
		// Amina's own word still reaches her comment.
		mergeSessionComments(DECK, [], [{ id: 'old1', owner: 'amina' }], 'me');
		expect(listComments(DECK).map((c) => c.id)).toEqual([own?.id]);
	});
});
