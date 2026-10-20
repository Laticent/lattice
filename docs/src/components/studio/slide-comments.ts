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
	/** Set on a comment a live session shared: who shared it, when that was not its writer (slice 6). */
	sharedBy?: string;
	/** Set on a comment that came from a live session: its owner's id there. Only that owner's word may
	 *  change or remove this copy later, so nobody can take a comment over by reusing its id. */
	owner?: string;
};

const PREFIX = 'lattice-studio-comments-'; // + deckId → SlideComment[]

// Alias export so the storage-overlay's category matcher can be drift-tested
// against the real prefix (storage-metrics.test.ts) without renaming PREFIX here.
export { PREFIX as COMMENTS_KEY_PREFIX };
/** Fired (window event) whenever a deck's comments change, so open views refresh. */
export const COMMENTS_EVENT = 'lattice-studio-comments-changed';

/**
 * A live session's hold on one deck's comments (2026-10-20 live note, slice 6). While a session is bound to
 * `deckId`, the person's own adds, resolves and deletes are reported to it, and it decides who may delete a
 * shared comment. Comments arriving from the session come in through `mergeSessionComments`, which reports
 * nothing back.
 */
export type CommentRelay = {
	deckId: string;
	added: (c: SlideComment) => void;
	resolved: (id: string, resolved: boolean) => void;
	deleted: (id: string) => void;
	mayDelete: (id: string) => boolean;
};
let relay: CommentRelay | null = null;
/** Set (or clear) the session's relay. Open views refresh, since who may delete has changed. */
export function setCommentRelay(next: CommentRelay | null): void {
	if (relay === next) return;
	const was = relay;
	relay = next;
	try {
		for (const d of new Set([was?.deckId, next?.deckId])) if (d) window.dispatchEvent(new CustomEvent(COMMENTS_EVENT, { detail: { deckId: d } }));
	} catch {
		/* no window: nothing to refresh */
	}
}
const relayFor = (deckId: string): CommentRelay | null => (relay && relay.deckId === deckId ? relay : null);
/** Whether this person may delete a comment: always outside a session; in one, its writer or the host. */
export function mayDeleteComment(deckId: string, id: string): boolean {
	return relayFor(deckId)?.mayDelete(id) ?? true;
}

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
		// A 1-based slide index — a positive integer. Drops junk anchors (0, -3, 1.5)
		// from an imported .lattice; an in-range-but-stale index is the documented
		// index-anchoring limit, not something this guard can catch.
		typeof o.slide === 'number' &&
		Number.isInteger(o.slide) &&
		o.slide >= 1 &&
		typeof o.body === 'string' &&
		typeof o.author === 'string' &&
		typeof o.createdAt === 'number' &&
		Number.isFinite(o.createdAt) &&
		typeof o.resolved === 'boolean' &&
		(o.sharedBy === undefined || typeof o.sharedBy === 'string') &&
		(o.owner === undefined || typeof o.owner === 'string')
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
	relayFor(deckId)?.added(comment);
	return comment;
}

/** Toggle (or set) a comment's resolved flag. */
export function setResolved(deckId: string, id: string, resolved: boolean): void {
	writeAll(deckId, readAll(deckId).map((c) => (c.id === id ? { ...c, resolved } : c)));
	relayFor(deckId)?.resolved(id, resolved);
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
	const r = relayFor(deckId);
	// In a session, someone else's shared comment is not this person's to delete.
	if (r && !r.mayDelete(id)) return;
	writeAll(deckId, readAll(deckId).filter((c) => c.id !== id));
	r?.deleted(id);
}

/**
 * Put comments a live session shared onto this browser's copy of the deck, and take deleted ones off. Each
 * is checked like any stored comment. Nothing is reported back to the session: this is the session's
 * own word arriving.
 *
 * A copy this browser already holds changes only under the owner it came with (checker, slice 6: a member
 * re-adding a known id would otherwise rewrite, then delete, someone else's comment on every copy). A
 * comment this browser wrote and never shared has no owner yet: only this browser's own share (`me`) may
 * claim it.
 */
export function mergeSessionComments(deckId: string, set: unknown[], del: Array<{ id: string; owner: string }>, me: string | null): void {
	const incoming = set.filter((c): c is SlideComment & { owner: string } => isComment(c) && typeof (c as SlideComment).owner === 'string');
	if (!incoming.length && !del.length) return;
	const byId = new Map(readAll(deckId).map((c) => [c.id, c]));
	const mayTouch = (held: SlideComment | undefined, owner: string) => !held || (held.owner !== undefined ? held.owner === owner : owner === me);
	let changed = false;
	for (const c of incoming) {
		if (!mayTouch(byId.get(c.id), c.owner)) continue;
		byId.set(c.id, { id: c.id, slide: c.slide, author: c.author, body: c.body, createdAt: c.createdAt, resolved: c.resolved, owner: c.owner, ...(c.sharedBy ? { sharedBy: c.sharedBy } : {}) });
		changed = true;
	}
	for (const d of del) {
		const held = byId.get(d.id);
		if (held && mayTouch(held, d.owner)) {
			byId.delete(d.id);
			changed = true;
		}
	}
	if (changed) writeAll(deckId, [...byId.values()]);
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

/**
 * Replace a deck's comments wholesale — for restoring a `.lattice` import onto a
 * freshly-created deck id. Untrusted input (a shared file), so every entry is run
 * through the same `isComment` guard `readAll` uses; malformed ones are dropped.
 * Returns how many survived. No-ops (clears) on an empty/invalid array.
 */
export function importComments(deckId: string, comments: unknown): number {
	const arr = Array.isArray(comments) ? comments.filter(isComment) : [];
	if (!arr.length) {
		clearComments(deckId);
		return 0;
	}
	writeAll(deckId, arr);
	return arr.length;
}
