// The deck doc kernel (deck-doc.ts) against the spike #3443 findings it rests on. Every random section is seeded,
// and the seed is printed (design §10 proof rules): rerun one with DECK_DOC_SEED=<seed>.

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { adoptOutside, applyLineDiff, clientIdFor, DECK_TEXT, deckDoc, docText, encodeDoc, hasPending, headOf, lineDiff, loadDoc, localSave, textAt, threeWayText } from './deck-doc';

const SEED = Number(process.env.DECK_DOC_SEED ?? 20261128) >>> 0;
console.log(`deck-doc.test seed ${SEED} (DECK_DOC_SEED to rerun)`);

/** mulberry32, the spike's generator. */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const deckText = (r: () => number, lines: number) =>
	Array.from({ length: lines }, (_, i) => (i % 12 === 0 ? `---\n\n# Slide ${i / 12 + 1}` : `- point ${i} ${Math.floor(r() * 1e9).toString(36)}`)).join('\n');
/** Reword, insert or delete lines; every reword and insert carries `<tag><k>`, so a test can find it again. */
const mutate = (r: () => number, text: string, n: number, tag: string, deletes = true) => {
	const L = text.split('\n');
	for (let k = 0; k < n; k++) {
		const x = Math.floor(r() * L.length);
		const kind = r();
		if (kind < 0.5) L[x] = `${L[x].replace(/ \S+$/, '')} ${tag}${k}`;
		else if (kind < 0.75 || !deletes) L.splice(x, 0, `- new ${tag}${k} ${Math.floor(r() * 1e6)}`);
		else if (L.length > 4) L.splice(x, 1);
	}
	return L.join('\n');
};
const markers = (text: string, tag: string) => text.match(new RegExp(`${tag}\\d+`, 'g')) ?? [];
const withText = (clientID: number, text: string) => {
	const d = deckDoc(clientID);
	d.getText(DECK_TEXT).insert(0, text);
	return d;
};
const clone = (doc: Y.Doc, clientID: number) => {
	const d = deckDoc(clientID);
	Y.applyUpdate(d, encodeDoc(doc));
	return d;
};

describe('line diffs', () => {
	it(`apply exactly, and stay minimal (seed ${SEED ^ 0x1})`, () => {
		const r = rng(SEED ^ 0x1);
		for (let k = 0; k < 300; k++) {
			const a = deckText(r, 5 + Math.floor(r() * 40)) + (r() < 0.3 ? '\n' : '');
			const b = mutate(r, a, 1 + Math.floor(r() * 6), 'E');
			const d = withText(7, a);
			applyLineDiff(d.getText(DECK_TEXT), a, b);
			expect(docText(d)).toBe(b);
		}
		// One reworded line is one delete and one insert, not the deck.
		const ops = lineDiff('a\nb\nc', 'a\nB\nc');
		expect(ops.filter(([o]) => o !== '=')).toEqual([['-', 'b'], ['+', 'B']]);
	});
	it('refuses a text that is not at `from`', () => {
		expect(() => applyLineDiff(withText(1, 'x').getText(DECK_TEXT), 'y', 'z')).toThrow();
	});
});

describe('clientIdFor', () => {
	it('is stable, 30-bit and never 0', () => {
		expect(clientIdFor('tab:dev:0')).toBe(clientIdFor('tab:dev:0'));
		expect(clientIdFor('tab:dev:0')).not.toBe(clientIdFor('tab:dev:1'));
		for (const k of ['', 'a', 'tab:x:9']) {
			const id = clientIdFor(k);
			expect(id).toBeGreaterThan(0);
			expect(id).toBeLessThan(2 ** 30);
		}
	});
});

describe('localSave: three-way from a stale tab (finding 3)', () => {
	it(`never deletes newer text, and never loses the stale tab's own edits (seed ${SEED ^ 0x3})`, () => {
		const r = rng(SEED ^ 0x3);
		let newerLost = 0;
		let staleLost = 0;
		let naiveLost = 0;
		const trials = 300;
		for (let k = 0; k < trials; k++) {
			const loaded = deckText(r, 40);
			const live = withText(11, loaded);
			// Another tab saves first: its edits insert or reword (no deletes, so no true delete-vs-edit overlap).
			const newer = mutate(r, loaded, 3, `NEW${k}-`, false);
			const other = clone(live, 12);
			localSave(other, loaded, newer);
			Y.applyUpdate(live, encodeDoc(other));
			// This tab still shows `loaded`, edits it, and saves.
			const stale = mutate(r, loaded, 3, `OLD${k}-`, false);
			const control = clone(live, 13);
			applyLineDiff(control.getText(DECK_TEXT), docText(control), stale); // the naive save
			if (markers(newer, `NEW${k}-`).some((m) => !docText(control).includes(m))) naiveLost++;
			const { merged, delta } = localSave(live, loaded, stale);
			expect(delta).not.toBeNull();
			expect(merged).toBe(docText(live));
			if (markers(newer, `NEW${k}-`).some((m) => !merged.includes(m))) newerLost++;
			if (markers(stale, `OLD${k}-`).some((m) => !merged.includes(m))) staleLost++;
		}
		expect(naiveLost).toBeGreaterThan(trials / 2); // the control proves the test can fail
		expect(newerLost).toBe(0);
		expect(staleLost).toBe(0);
	});
	it('a save from an up-to-date tab is the plain diff, and a no-op makes no update', () => {
		const d = withText(5, 'a\nb');
		expect(localSave(d, 'a\nb', 'a\nb').delta).toBeNull();
		const res = localSave(d, 'a\nb', 'a\nc');
		expect(res.merged).toBe('a\nc');
		expect(res.delta).not.toBeNull();
	});
});

describe('threeWayText', () => {
	it('keeps both sides and is the identity on one side', () => {
		expect(threeWayText('a\nb\nc', 'A\nb\nc', 'a\nb\nC')).toBe('A\nb\nC');
		expect(threeWayText('a', 'a', 'z')).toBe('z');
		expect(threeWayText('a', 'z', 'a')).toBe('z');
	});
});

describe('loadDoc: an update on a rebuilt base (finding 2b-ii)', () => {
	it('sets the update aside instead of letting it sit silently in pendingStructs', () => {
		const original = withText(21, 'one\ntwo\nthree');
		const sv = Y.encodeStateVector(original);
		original.getText(DECK_TEXT).insert(0, 'zero\n');
		const update = Y.encodeStateAsUpdate(original, sv);
		// `.lattice/` rebuilt from deck.md: the same text with new history.
		const rebuilt = encodeDoc(withText(99, 'one\ntwo\nthree'));
		// The silent failure, shown: applying it raises nothing and changes nothing.
		const raw = deckDoc(5);
		Y.applyUpdate(raw, rebuilt);
		Y.applyUpdate(raw, update);
		expect(docText(raw)).toBe('one\ntwo\nthree');
		expect(hasPending(raw)).toBe(true);
		// The loader names it and returns a clean doc.
		const { doc, pending } = loadDoc(5, rebuilt, [{ name: 'u-1', bytes: update }]);
		expect(pending).toEqual(['u-1']);
		expect(hasPending(doc)).toBe(false);
		expect(docText(doc)).toBe('one\ntwo\nthree');
	});
	it('places an update listed before the one it depends on (path order is not causal order)', () => {
		const base = withText(1, 'a');
		const baseBytes = encodeDoc(base);
		const t = clone(base, 8);
		const u1 = localSave(t, 'a', 'a\nb').delta as Uint8Array;
		const u2 = localSave(t, 'a\nb', 'a\nb\nc').delta as Uint8Array;
		const { doc, pending } = loadDoc(9, baseBytes, [{ name: 'dev-10', bytes: u2 }, { name: 'dev-9', bytes: u1 }]);
		expect(pending).toEqual([]);
		expect(docText(doc)).toBe('a\nb\nc');
		expect(doc.clientID).toBe(9);
	});
	it('merges per-tab update files in any order, and a duplicate is a no-op', () => {
		const base = withText(1, 'a\nb\nc');
		const baseBytes = encodeDoc(base);
		const tabs = [2, 3, 4].map((id) => clone(base, id));
		const ups = tabs.map((t, i) => ({ name: `t${i}`, bytes: localSave(t, 'a\nb\nc', `a\nb\nc\nT${i}`).delta as Uint8Array }));
		const one = docText(loadDoc(9, baseBytes, ups).doc);
		const rev = docText(loadDoc(9, baseBytes, [...ups].reverse()).doc);
		const dup = docText(loadDoc(9, baseBytes, [...ups, ups[0]]).doc);
		expect(rev).toBe(one);
		expect(dup).toBe(one);
		for (const i of [0, 1, 2]) expect(one).toContain(`T${i}`);
	});
});

describe('adoptOutside: an outside edit on a fork at the chained base (findings 2c-i, 2c-ii, 2c-iii)', () => {
	const trials = 200;
	/** Two devices at one state; A then edits locally; both adopt the same outside revision; then they sync. */
	function trial(r: () => number, k: number, onFork: boolean) {
		const origin = withText(31, deckText(r, 30));
		const head = headOf(origin);
		const baseText = docText(origin);
		const outside = mutate(r, baseText, 3, `DRV${k}-`);
		const A = clone(origin, 41);
		const B = clone(origin, 42);
		const local = mutate(r, baseText, 3, `LOC${k}-`);
		localSave(A, baseText, local);
		const rev = `rev-${k}`;
		for (const d of [A, B]) {
			if (onFork) expect(adoptOutside(d, head, outside, rev)).not.toBeNull();
			else {
				// The design as first written: the diff straight onto the live doc as the synthetic client.
				const saved = d.clientID;
				d.clientID = clientIdFor(`outside:${rev}`);
				const cur = docText(d);
				d.transact(() => applyLineDiff(d.getText(DECK_TEXT), cur, threeWayText(baseText, outside, cur)));
				d.clientID = saved;
			}
		}
		Y.applyUpdate(A, encodeDoc(B));
		Y.applyUpdate(B, encodeDoc(A));
		const t = docText(A);
		return {
			diverged: t !== docText(B),
			dup: markers(outside, `DRV${k}-`).some((m) => t.split(m).length - 1 > 1),
			lostLocal: markers(local, `LOC${k}-`).some((m) => !t.includes(m)),
		};
	}
	it(`the live-doc control diverges, the fork never does (seed ${SEED ^ 0xc})`, () => {
		const r = rng(SEED ^ 0xc);
		const live = { diverged: 0, dup: 0, lostLocal: 0 };
		const fork = { diverged: 0, dup: 0, lostLocal: 0 };
		for (let k = 0; k < trials; k++) {
			for (const [onFork, tally] of [[false, live], [true, fork]] as const) {
				const res = trial(rng((SEED ^ 0xc) + k), k, onFork);
				for (const key of ['diverged', 'dup', 'lostLocal'] as const) if (res[key]) tally[key]++;
			}
			r();
		}
		expect(live.diverged).toBeGreaterThan(0); // the failing arm: 2c-ii reproduces
		expect(fork).toEqual({ diverged: 0, dup: 0, lostLocal: 0 });
	});
	it('adopting the same revision twice adds nothing, and a doc without the base returns null', () => {
		const origin = withText(31, 'a\nb\nc');
		const head = headOf(origin);
		const d = clone(origin, 50);
		adoptOutside(d, head, 'a\nB\nc', 'rev-1');
		const once = docText(d);
		const again = adoptOutside(d, head, 'a\nB\nc', 'rev-1');
		expect(again?.merged).toBe(once);
		expect(once).toBe('a\nB\nc');
		expect(textAt(d, head)).toBe('a\nb\nc');
		expect(adoptOutside(withText(77, 'other'), head, 'x', 'rev-2')).toBeNull();
	});
});

describe(`many tabs, random saves from stale bases (seed ${SEED ^ 0x7})`, () => {
	it('every tab converges on one text that holds every tab’s inserts', () => {
		const r = rng(SEED ^ 0x7);
		for (let round = 0; round < 40; round++) {
			const start = deckText(r, 24);
			const root = withText(1, start);
			const tabs = Array.from({ length: 2 + Math.floor(r() * 3) }, (_, i) => ({ doc: clone(root, clientIdFor(`tab:dev:${i}`)), base: start, inserts: [] as string[] }));
			const outbox: Uint8Array[] = [];
			for (let step = 0; step < 30; step++) {
				const t = tabs[Math.floor(r() * tabs.length)];
				if (r() < 0.35 && outbox.length) {
					// Hear a random subset of the other tabs' updates, in a random order, then reload from the doc.
					for (const u of outbox.filter(() => r() < 0.6)) Y.applyUpdate(t.doc, u);
					t.base = docText(t.doc);
					continue;
				}
				const tag = `R${round}S${step}-`;
				// Inserts only: a reword replaces a line's tail, which may be a marker another save wrote.
				const lines = t.base.split('\n');
				for (let k = 0; k < 2; k++) lines.splice(Math.floor(r() * (lines.length + 1)), 0, `- new ${tag}${k}`);
				const next = lines.join('\n');
				t.inserts.push(...markers(next, tag));
				const { merged, delta } = localSave(t.doc, t.base, next);
				t.base = merged;
				if (delta) outbox.push(delta);
			}
			for (const t of tabs) for (const u of outbox) Y.applyUpdate(t.doc, u);
			const texts = tabs.map((t) => docText(t.doc));
			expect(new Set(texts).size).toBe(1);
			for (const t of tabs) for (const m of t.inserts) expect(texts[0]).toContain(m);
		}
	});
});
