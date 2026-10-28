// @vitest-environment node
// The slice 1 spike's evidence, kept as the guard for Compose's scoped apply (Filo slice 4,
// engineering/decisions/2026-10-27-filo-undo-history.md §10). Runs over every deck in examples/ plus
// the integration gallery: edit, delete, insert and front-matter changes around the first, middle
// and last slide, then the undo back.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState, Selection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, emitDeck, initBaseline } from './deck-doc';
import { parseDeck } from './deck-source';
import { baselineSource, emitPatch, scopedResync, scopedResyncPatch } from './scoped-resync';

const ROOT = join(__dirname, '..', '..', '..', '..');
const decks = [
	...readdirSync(join(ROOT, 'examples'))
		.filter((f) => f.endsWith('.md'))
		.map((f) => join(ROOT, 'examples', f)),
	join(ROOT, 'test/integration/baseline-decks/gallery.md'),
];

type Op = 'edit' | 'delete' | 'insert' | 'frontmatter';
const OPS: Op[] = ['edit', 'delete', 'insert', 'frontmatter'];

function mutate(fm: string, raws: string[], k: number, op: Op): string | null {
	const r = raws.slice();
	if (op === 'edit') r[k] = `${r[k]}\n\nAn added paragraph.`;
	else if (op === 'delete') {
		if (r.length < 2) return null;
		r.splice(k, 1);
	} else if (op === 'insert') r.splice(k + 1, 0, '# A new slide\n\nIts body.');
	else {
		if (!fm || !/\n---\s*$/.test(fm.trimEnd() + '\n')) return null;
		const at = fm.lastIndexOf('\n---');
		if (at <= 0) return null;
		return baselineSource(`${fm.slice(0, at)}\nfiloSpike: 1${fm.slice(at)}`, r);
	}
	return baselineSource(fm, r);
}

const stats = { decks: 0, unstable: [] as string[], cases: 0, fallbacks: [] as string[], patchCases: 0 };

describe('scoped resync over every deck', () => {
	it('is byte-exact, keeps untouched slide identity and the caret, and undoes exactly', () => {
		for (const file of decks) {
			const src = readFileSync(file, 'utf8');
			const doc0 = deckToDoc(src);
			const base = initBaseline(doc0);
			const S0 = emitDeck(doc0, base);
			// The baseline must describe its own emit: re-splitting S0 gives back the same chunks.
			const re = parseDeck(S0);
			if (re.slides.map((s) => s.raw).join('\u0000') !== base.raws.join('\u0000') || re.fm !== ((doc0.attrs.frontMatter as string) || '')) {
				stats.unstable.push(file);
				continue;
			}
			stats.decks++;
			const fm = (doc0.attrs.frontMatter as string) || '';
			const n = base.raws.length;
			for (const k of [...new Set([0, Math.floor(n / 2), n - 1])]) {
				for (const op of OPS) {
					const S1 = mutate(fm, base.raws, k, op);
					if (S1 == null) continue;
					// Fresh state and baseline per case.
					const d0 = deckToDoc(src);
					const b = initBaseline(d0);
					emitDeck(d0, b);
					let state = EditorState.create({ doc: d0, schema: deckSchema });
					// Caret inside the last slide (or the first, when the last is the one edited).
					const caretSlide = k === n - 1 ? 0 : n - 1;
					let pos = 0;
					for (let i = 0; i < caretSlide; i++) pos += d0.child(i).nodeSize;
					const sel = Selection.findFrom(d0.resolve(pos + 1), 1, true);
					if (sel) state = state.apply(state.tr.setSelection(sel));
					const before = { slide: state.selection.$head.index(0), offset: state.selection.$head.parentOffset, text: state.selection.$head.parent.textContent };

					// A fold on the caret's slide, as the collapse plugin stores it: a node decoration.
					const folds = DecorationSet.create(d0, [Decoration.node(pos, pos + d0.child(caretSlide).nodeSize, { class: 'cs-collapsed' })]);
					const r = scopedResync(state, b, S1);
					if (!r) {
						stats.fallbacks.push(`${file}#${k}:${op}`);
						continue;
					}
					const s1 = state.apply(r.tr);
					r.commit(s1.doc);
					const label = `${file} slide ${k} ${op}`;
					expect(emitDeck(s1.doc, b), label).toBe(S1);
					for (let j = 0; j < r.first; j++) expect(s1.doc.child(j) === d0.child(j), `${label}: head slide ${j} kept`).toBe(true);
					const tailCount = d0.childCount - r.first - r.removed;
					for (let t = 1; t <= tailCount; t++) expect(s1.doc.child(s1.doc.childCount - t) === d0.child(d0.childCount - t), `${label}: tail slide kept`).toBe(true);
					// The caret's slide was untouched, so it is in the same text at the same offset.
					const $h = s1.selection.$head;
					if (caretSlide !== k) expect({ offset: $h.parentOffset, text: $h.parent.textContent }, `${label}: caret`).toEqual({ offset: before.offset, text: before.text });

					// The fold maps through the transaction and still covers the same (untouched) slide.
					if (caretSlide !== k) {
						const mapped = folds.map(r.tr.mapping, s1.doc).find();
						expect(mapped.length, `${label}: fold kept`).toBe(1);
						expect(s1.doc.nodeAt(mapped[0].from) === d0.child(caretSlide), `${label}: fold on its slide`).toBe(true);
					}
					// Undo: back to S0, exactly, keeping the slides untouched both ways.
					const back = scopedResync(s1, b, S0);
					expect(back, `${label}: undo resync`).not.toBeNull();
					if (!back) continue;
					const s2 = s1.apply(back.tr);
					back.commit(s2.doc);
					expect(emitDeck(s2.doc, b), `${label}: undo bytes`).toBe(S0);
					for (let j = 0; j < back.first; j++) expect(s2.doc.child(j) === d0.child(j), `${label}: undo head kept`).toBe(true);

					// The source patch is the narrow one.
					const patch = emitPatch(S0, S1);
					expect(patch && S0.slice(0, patch.from) + patch.insert + S0.slice(patch.to), `${label}: patch applies`).toBe(S1);

					// The PATCH-driven path gives exactly what the whole-source path gives, both ways.
					if (patch) {
						const d = deckToDoc(src);
						const bb = initBaseline(d);
						emitDeck(d, bb);
						const st = EditorState.create({ doc: d, schema: deckSchema });
						const rp = scopedResyncPatch(st, bb, patch);
						expect(rp, `${label}: patch resync`).not.toBeNull();
						if (rp) {
							const sp = st.apply(rp.tr);
							rp.commit(sp.doc);
							expect(emitDeck(sp.doc, bb), `${label}: patch bytes`).toBe(S1);
							expect(rp.first, `${label}: same run`).toBe(r.first);
							const undo = emitPatch(S1, S0);
							const ru = undo && scopedResyncPatch(sp, bb, undo);
							expect(ru, `${label}: patch undo`).toBeTruthy();
							if (ru) {
								const su = sp.apply(ru.tr);
								ru.commit(su.doc);
								expect(emitDeck(su.doc, bb), `${label}: patch undo bytes`).toBe(S0);
								for (let j = 0; j < ru.first; j++) expect(su.doc.child(j) === d.child(j), `${label}: patch undo head kept`).toBe(true);
							}
							stats.patchCases++;
						}
					}
					stats.cases++;
				}
			}
		}
		console.log(`[scoped-resync] decks ${stats.decks}, cases ${stats.cases}, patch cases ${stats.patchCases}, unstable ${stats.unstable.length}, fallbacks ${stats.fallbacks.length}`);
		if (stats.unstable.length) console.log('[scoped-resync] unstable:', stats.unstable.map((f) => f.replace(ROOT, '')).join(', '));
		if (stats.fallbacks.length) console.log('[scoped-resync] fallbacks:', stats.fallbacks.slice(0, 20).map((f) => f.replace(ROOT, '')).join(', '));
		expect(stats.decks).toBeGreaterThan(100);
	}, 600_000);
});

describe('scoped resync cost on the 134 KB deck (Node)', () => {
	it('measures scoped apply against a full rebuild', () => {
		const src = readFileSync(join(ROOT, 'examples/system-design-foundations.md'), 'utf8');
		const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
		const scoped: number[] = [];
		const full: number[] = [];
		const patched: number[] = [];
		for (let run = 0; run < 15; run++) {
			const d0 = deckToDoc(src);
			const b = initBaseline(d0);
			const S0 = emitDeck(d0, b);
			const state = EditorState.create({ doc: d0, schema: deckSchema });
			const k = Math.floor(b.raws.length / 2);
			const raws = b.raws.slice();
			raws[k] += '\n\nAn added paragraph.';
			const S1 = baselineSource((d0.attrs.frontMatter as string) || '', raws);
			let t = performance.now();
			const r = scopedResync(state, b, S1);
			if (!r) throw new Error('fallback');
			const s1 = state.apply(r.tr);
			r.commit(s1.doc);
			scoped.push(performance.now() - t);
			t = performance.now();
			EditorState.create({ doc: deckToDoc(S1), schema: deckSchema });
			full.push(performance.now() - t);
			const d2 = deckToDoc(src);
			const b2 = initBaseline(d2);
			emitDeck(d2, b2);
			const st2 = EditorState.create({ doc: d2, schema: deckSchema });
			const pt = emitPatch(S0, S1);
			if (!pt) throw new Error('no patch');
			t = performance.now();
			const rp = scopedResyncPatch(st2, b2, pt);
			if (!rp) throw new Error('patch fallback');
			rp.commit(st2.apply(rp.tr).doc);
			patched.push(performance.now() - t);
			expect(S0.length).toBeGreaterThan(100_000);
		}
		console.log(`[scoped-resync] 134 KB deck, one-slide change: scoped median ${median(scoped).toFixed(2)} ms, patch-driven median ${median(patched).toFixed(2)} ms, full rebuild median ${median(full).toFixed(2)} ms`);
	});
});

describe('an edit that opens a code fence', () => {
	it('falls back so the result matches the whole-source path exactly', () => {
		let checked = 0;
		for (const file of decks.slice(0, 60)) {
			const src = readFileSync(file, 'utf8');
			const d = deckToDoc(src);
			const b = initBaseline(d);
			const S0 = emitDeck(d, b);
			if (b.raws.length < 3) continue;
			const k = 1;
			const fm = (d.attrs.frontMatter as string) || '';
			const raws = b.raws.slice();
			raws[k] = `${raws[k]}\n\n\`\`\`text\nan unclosed fence`;
			const S1 = baselineSource(fm, raws);
			const patch = emitPatch(S0, S1);
			if (!patch) continue;
			const full = scopedResync(EditorState.create({ doc: deckToDoc(src), schema: deckSchema }), (() => { const x = initBaseline(deckToDoc(src)); return x; })(), S1);
			const st = EditorState.create({ doc: d, schema: deckSchema });
			const rp = scopedResyncPatch(st, b, patch);
			// Whatever the whole-source split makes of it, the patch path must make the same.
			const want = parseDeck(S1);
			if (!rp) {
				expect(full, `${file}: both paths agree there is nothing to do`).toBeNull();
				continue;
			}
			const sp = st.apply(rp.tr);
			rp.commit(sp.doc);
			expect(b.raws, `${file}: same slides as the whole-source split`).toEqual(want.slides.map((s) => s.raw));
			checked++;
		}
		expect(checked).toBeGreaterThan(20);
	});
});
