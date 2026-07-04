// Comments — per-deck review feedback, an APP-STATE layer (not the deck markdown).
//
// A comment is review feedback left ON a slide ("double-check this number") — a
// distinct channel from the speaker note (what you SAY) and the accessibility
// description (what's THERE). Per the decision, comments live in the app / the
// `.lattice` file, never baked into the deck source or an audience PDF by default.
// This module is the app-state home: per-deck, localStorage-backed, the sibling of
// studio-store's persistence. The `.lattice` manifest serialization and the opt-in
// PDF-sticky-note export are the documented follow-ons.
//
// Anchor: a comment is anchored to a slide by its 1-based INDEX. Reorder-stable
// anchoring (a per-slide stable id / Yjs relative position) is the collaboration-era
// follow-on — stated openly here so index anchoring is a known MVP limitation, not a
// silent bug. See engineering/decisions/2026-07-04-comments-layer.md (Open questions).

export type SlideComment = {
	/** Stable id for this comment (not the slide). */
	id: string;
	/** 1-based slide index this comment is anchored to (see anchor note above). */
	slide: number;
	/** Free-text author label. A real identity system is the collaboration follow-on. */
	author: string;
	body: string;
	/** ms epoch. */
	createdAt: number;
	resolved: boolean;
};

const PREFIX = 'lattice-studio-comments-'; // + deckId → SlideComment[]
/** Fired (window event) whenever a deck's comments change, so open views refresh. */
export const COMMENTS_EVENT = 'lattice-studio-comments-changed';

function key(deckId: string): string {
	return PREFIX + deckId;
}

function readAll(deckId: string): SlideComment[] {
	try {
		const v = localStorage.getItem(key(deckId));
		const arr = v ? (JSON.parse(v) as unknown) : null;
		return Array.isArray(arr) ? (arr as SlideComment[]).filter(isComment) : [];
	} catch {
		return [];
	}
}

function isComment(c: unknown): c is SlideComment {
	if (!c || typeof c !== 'object') return false;
	const o = c as SlideComment;
	// Validate every display-critical field, not just id/slide — a tampered store
	// entry with an undefined createdAt would otherwise render "NaNd ago" and an
	// undefined body an empty bubble. A malformed entry is dropped, not shown.
	return (
		typeof o.id === 'string' &&
		typeof o.slide === 'number' &&
		typeof o.body === 'string' &&
		typeof o.author === 'string' &&
		typeof o.createdAt === 'number' &&
		Number.isFinite(o.createdAt) &&
		typeof o.resolved === 'boolean'
	);
}

function writeAll(deckId: string, comments: SlideComment[]): void {
	try {
		localStorage.setItem(key(deckId), JSON.stringify(comments));
		window.dispatchEvent(new CustomEvent(COMMENTS_EVENT, { detail: { deckId } }));
	} catch {
		/* storage full / unavailable — non-fatal */
	}
}

function uid(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
	}
}

/** All comments for a deck, newest last (creation order). */
export function listComments(deckId: string): SlideComment[] {
	return readAll(deckId).sort((a, b) => a.createdAt - b.createdAt);
}

/** Comments anchored to a given 1-based slide index. */
export function commentsForSlide(deckId: string, slide: number): SlideComment[] {
	return listComments(deckId).filter((c) => c.slide === slide);
}

/** How many UNRESOLVED comments a slide carries (for the rail/badge). */
export function openCountForSlide(deckId: string, slide: number): number {
	return commentsForSlide(deckId, slide).filter((c) => !c.resolved).length;
}

/** Add a comment to a slide; returns the created comment. */
export function addComment(deckId: string, slide: number, body: string, author = 'You'): SlideComment | null {
	const text = body.trim();
	if (!text) return null;
	const comment: SlideComment = { id: uid(), slide, author: author.trim() || 'You', body: text, createdAt: Date.now(), resolved: false };
	writeAll(deckId, [...readAll(deckId), comment]);
	return comment;
}

/** Toggle (or set) a comment's resolved flag. */
export function setResolved(deckId: string, id: string, resolved: boolean): void {
	writeAll(deckId, readAll(deckId).map((c) => (c.id === id ? { ...c, resolved } : c)));
}

/** Edit a comment's body (empty body deletes it). */
export function editComment(deckId: string, id: string, body: string): void {
	const text = body.trim();
	if (!text) {
		deleteComment(deckId, id);
		return;
	}
	writeAll(deckId, readAll(deckId).map((c) => (c.id === id ? { ...c, body: text } : c)));
}

/** Delete a comment. */
export function deleteComment(deckId: string, id: string): void {
	writeAll(deckId, readAll(deckId).filter((c) => c.id !== id));
}

/** Drop every comment for a deck (e.g. on deck delete). Removes the storage key
 *  entirely — not an empty array — so a deleted deck leaves no orphaned entry. */
export function clearComments(deckId: string): void {
	try {
		localStorage.removeItem(key(deckId));
		window.dispatchEvent(new CustomEvent(COMMENTS_EVENT, { detail: { deckId } }));
	} catch {
		/* storage unavailable — non-fatal */
	}
}
