/**
 * A deck's shared document: the Yjs half of the deck format (design §6.4, "Markdown plus Yjs update files").
 * Pure: no vault, no clock, no storage. The Studio's deck store (`components/studio/deck-vault.ts`) reads and
 * writes the files; this module only builds, merges and diffs documents.
 *
 * WHAT IS HERE, and the spike finding each rule rests on (spike #3443, Node 22, yjs 13.6.33):
 *   · `localSave`: a tab's save is a THREE-WAY merge against the text that tab last loaded, never a diff
 *     against the doc's current text (finding 3: the naive save lost newer text in 296 of 300 trials).
 *   · `loadDoc`: after every `applyUpdate`, check `pendingStructs` / `pendingDs`. An update made against a
 *     base with new history (`.lattice/` rebuilt from `deck.md`) sits pending with no error and no text
 *     change (finding 2b-ii), so the loader sets it aside and says so.
 *   · `adoptOutside`: an edit made outside Lattice is applied on a FORK at the chained base's Yjs state, as a
 *     synthetic client named by the edit's revision, and only the fork's delta reaches the live doc. Applied
 *     straight onto a live doc with unsynced local edits, 11 of 200 trials diverged for good (2c-ii); the fork
 *     passed 200 of 200 (2c-iii).
 *   · `clientIdFor`: a stable client id per (device, tab slot), so the state vector does not grow by a client
 *     per session (2d), and two tabs never share one (the slot is a Web Lock, held by the caller).
 *
 * Every doc keeps its history (`gc: false`): forking at a past state needs it, and §6.4 trims nothing.
 */
import * as Y from 'yjs';

/** The one shared type in a deck doc. */
export const DECK_TEXT = 'source';

/** A 30-bit client id from a key: FNV-1a, never 0. Deterministic, so a slot keeps its id across reloads and two
 *  devices adopting the same outside revision create the same items (2c-i). */
export function clientIdFor(key: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0 & 0x3fffffff) || 1;
}

export function deckDoc(clientID: number): Y.Doc {
	const doc = new Y.Doc({ gc: false });
	doc.clientID = clientID;
	return doc;
}

export const docText = (doc: Y.Doc): string => doc.getText(DECK_TEXT).toString();

/** True when the doc holds structs or deletes it could not place: an update made against history it lacks. */
export function hasPending(doc: Y.Doc): boolean {
	return doc.store.pendingStructs !== null || doc.store.pendingDs !== null;
}

// ── Minimal line diffs ──────────────────────────────────────────────────────────────────────────────────────
// Lines are joined by '\n'; every line but the last owns its trailing '\n'. A minimal diff keeps history small:
// delete-all plus insert measured 5.9 times bigger (spike 2e).

type LineOp = ['=' | '-' | '+', string];
/** Above this many cells the LCS table costs more memory than the history it saves; the middle is replaced whole. */
const LCS_CELLS_MAX = 4_000_000;

export function lineDiff(a: string, b: string): LineOp[] {
	const A = a.split('\n');
	const B = b.split('\n');
	let s = 0;
	while (s < A.length && s < B.length && A[s] === B[s]) s++;
	let e = 0;
	while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
	const a2 = A.slice(s, A.length - e);
	const b2 = B.slice(s, B.length - e);
	const n = a2.length;
	const m = b2.length;
	const ops: LineOp[] = [];
	for (let k = 0; k < s; k++) ops.push(['=', A[k]]);
	if (n * m > LCS_CELLS_MAX) {
		for (const l of a2) ops.push(['-', l]);
		for (const l of b2) ops.push(['+', l]);
	} else {
		const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
		for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
		let i = 0;
		let j = 0;
		while (i < n && j < m) {
			if (a2[i] === b2[j]) {
				ops.push(['=', a2[i]]);
				i++;
				j++;
			} else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', a2[i++]]);
			else ops.push(['+', b2[j++]]);
		}
		while (i < n) ops.push(['-', a2[i++]]);
		while (j < m) ops.push(['+', b2[j++]]);
	}
	for (let k = A.length - e; k < A.length; k++) ops.push(['=', A[k]]);
	return ops;
}

/** Turn `ytext` from `from` into `to` with a minimal line diff. Throws when `ytext` is not at `from`. */
export function applyLineDiff(ytext: Y.Text, from: string, to: string): void {
	if (ytext.toString() !== from) throw new Error('applyLineDiff: the text is not at `from`');
	if (from === to) return;
	const ops = lineDiff(from, to);
	const total = from.split('\n').length;
	let pos = 0;
	let srcLine = 0;
	for (const [op, line] of ops) {
		if (op === '=') {
			pos += line.length + (srcLine < total - 1 ? 1 : 0);
			srcLine++;
		} else if (op === '-') {
			const last = srcLine === total - 1;
			if (last && pos > 0) {
				ytext.delete(pos - 1, line.length + 1); // the '\n' before the last line goes with it
				pos -= 1;
			} else ytext.delete(pos, line.length + (last ? 0 : 1));
			srcLine++;
		} else {
			const s = srcLine === total ? `\n${line}` : `${line}\n`;
			ytext.insert(pos, s);
			pos += s.length;
		}
	}
	if (ytext.toString() !== to) {
		// The trailing-line edge cases: finish with one character splice, which is always exact.
		const cur = ytext.toString();
		let p = 0;
		while (p < cur.length && p < to.length && cur[p] === to[p]) p++;
		let q = 0;
		while (q < cur.length - p && q < to.length - p && cur[cur.length - 1 - q] === to[to.length - 1 - q]) q++;
		ytext.delete(p, cur.length - p - q);
		ytext.insert(p, to.slice(p, to.length - q));
	}
}

/**
 * Three-way text merge over lines: `ours` (base → ours) applied onto `theirs` (base → theirs). Both sides are
 * diffs on forks of one doc built from `base`, so Yjs places them; an overlap keeps both sides' inserts, and
 * a line one side deleted and the other kept stays deleted. Never fails.
 */
export function threeWayText(base: string, ours: string, theirs: string): string {
	if (ours === base) return theirs;
	if (theirs === base || theirs === ours) return ours;
	const root = deckDoc(1);
	root.getText(DECK_TEXT).insert(0, base);
	const sv = Y.encodeStateVector(root);
	const baseUpdate = Y.encodeStateAsUpdate(root);
	const o = deckDoc(2);
	Y.applyUpdate(o, baseUpdate);
	applyLineDiff(o.getText(DECK_TEXT), base, ours);
	const t = deckDoc(3);
	Y.applyUpdate(t, baseUpdate);
	applyLineDiff(t.getText(DECK_TEXT), base, theirs);
	Y.applyUpdate(t, Y.encodeStateAsUpdate(o, sv));
	return docText(t);
}

// ── Loading ─────────────────────────────────────────────────────────────────────────────────────────────────

export type LoadedDoc = {
	doc: Y.Doc;
	/** Updates that could not be placed (they were made against history this doc lacks), by name. Their files
	 *  are kept; `deck.md` carries their text, and the caller adopts it (finding 2b-ii). */
	pending: string[];
};

/** Build a deck's doc from its base and update files. Order does not matter; an update applied twice is a no-op. */
export function loadDoc(clientID: number, base: Uint8Array | null, updates: readonly { name: string; bytes: Uint8Array }[]): LoadedDoc {
	const good: Uint8Array[] = base ? [base] : [];
	let doc = deckDoc(clientID);
	if (base) Y.applyUpdate(doc, base);
	if (hasPending(doc)) throw new Error('the deck base is not a whole document');
	const pending: string[] = [];
	for (const u of updates) {
		Y.applyUpdate(doc, u.bytes);
		if (!hasPending(doc)) {
			good.push(u.bytes);
			continue;
		}
		// The doc now holds structs it cannot place. Rebuild it from the updates that applied, so a later
		// update cannot complete the stray one by chance and put text back in an order nobody wrote.
		pending.push(u.name);
		doc = deckDoc(clientID);
		Y.applyUpdate(doc, Y.mergeUpdates(good));
	}
	return { doc, pending };
}

// ── Saving ──────────────────────────────────────────────────────────────────────────────────────────────────

export type SaveResult = {
	/** The doc's text after the save: `newText` unless another tab or device changed the doc since `baseText`. */
	merged: string;
	/** The update this save made, or null when it changed nothing. */
	delta: Uint8Array | null;
};

/**
 * A tab's save. `baseText` is the text this tab last loaded from the doc; `newText` is what the author has now.
 * When the doc moved on meanwhile (another tab saved), the tab's edits are merged three-way onto the doc's
 * current text, so a stale tab, a checkpoint restore or an AI apply never deletes newer text (§6.4).
 * The edit is made as the doc's own client id, which belongs to this tab alone.
 */
export function localSave(doc: Y.Doc, baseText: string, newText: string): SaveResult {
	const cur = docText(doc);
	const merged = cur === baseText ? newText : threeWayText(baseText, newText, cur);
	if (merged === cur) return { merged, delta: null };
	const sv = Y.encodeStateVector(doc);
	doc.transact(() => applyLineDiff(doc.getText(DECK_TEXT), cur, merged));
	return { merged, delta: Y.encodeStateAsUpdate(doc, sv) };
}

/** The doc's state as a compact snapshot (state vector plus delete set): the `deck.md` stamp's sidecar (§6.4). */
export function headOf(doc: Y.Doc): Uint8Array {
	return Y.encodeSnapshot(Y.snapshot(doc));
}

/** The text the doc had at `head`, or null when the doc does not hold that state. */
export function textAt(doc: Y.Doc, head: Uint8Array): string | null {
	const fork = forkAt(doc, head, 1);
	return fork ? docText(fork) : null;
}

function forkAt(doc: Y.Doc, head: Uint8Array, clientID: number): Y.Doc | null {
	let snap: Y.Snapshot;
	try {
		snap = Y.decodeSnapshot(head);
	} catch {
		return null;
	}
	// The doc must hold every struct the snapshot names, or the fork would be missing text without saying so.
	const have = Y.decodeStateVector(Y.encodeStateVector(doc));
	for (const [client, clock] of snap.sv) if ((have.get(client) ?? 0) < clock) return null;
	const fork = deckDoc(clientID);
	return Y.createDocFromSnapshot(doc, snap, fork);
}

/**
 * Adopt an edit made outside Lattice: `deck.md` changed, and `head` is the stamp of the doc state it was last
 * written from (the chained base). The diff from that state's text to `outsideText` is made on a fork at that
 * state, as a synthetic client named by `revisionKey`, and only the fork's delta reaches `doc`. Two devices
 * adopting the same revision create the same items, so the text appears once (2c-i), and local edits made
 * since the base are kept (2c-iii).
 *
 * Returns null when `doc` does not hold the base state (a rebuilt `.lattice/`); the caller then merges three-way
 * on text alone.
 */
export function adoptOutside(doc: Y.Doc, head: Uint8Array, outsideText: string, revisionKey: string): SaveResult | null {
	const fork = forkAt(doc, head, clientIdFor(`outside:${revisionKey}`));
	if (!fork) return null;
	const baseText = docText(fork);
	if (baseText === outsideText) return { merged: docText(doc), delta: null };
	const sv = Y.encodeStateVector(fork);
	fork.transact(() => applyLineDiff(fork.getText(DECK_TEXT), baseText, outsideText));
	const delta = Y.encodeStateAsUpdate(fork, sv);
	Y.applyUpdate(doc, delta);
	return { merged: docText(doc), delta };
}

/** A whole doc as one update (a base file). Lossless: `Y.mergeUpdates` only, nothing trims history (§6.4). */
export const encodeDoc = (doc: Y.Doc): Uint8Array => Y.encodeStateAsUpdate(doc);
export const mergeUpdates = (updates: Uint8Array[]): Uint8Array => Y.mergeUpdates(updates);
export const applyUpdate = (doc: Y.Doc, update: Uint8Array): void => Y.applyUpdate(doc, update);
export type { Doc as DeckDoc } from 'yjs';
