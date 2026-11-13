// The editor folds a picture's base64 to a chip (editor-payload-fold.ts). Pinned here: it folds exactly lint's payloads
// (lib/core/payload-elision.js `payloadRanges`), the text is never changed, an edit rescans only the lines it touched,
// and a fold appears or goes as an edit makes or breaks a payload.
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { payloadFold, payloadSize } from './editor-payload-fold';

const LONG = `${'QUJD'.repeat(1500)}Zg==`;
const deck = `# Title\n\n![bg](data:image/png;base64,${LONG})\n\nText ;base64,QUJD\n\n<img src="data:image/jpeg;base64,${LONG}">`;

function folds(state: EditorState): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (const set of state.facet(EditorView.decorations)) {
		const deco = typeof set === 'function' ? null : set;
		deco?.between(0, state.doc.length, (from, to) => {
			out.push([from, to]);
		});
	}
	return out;
}

const at = (text: string, n = 0) => {
	let i = -1;
	for (let k = 0; k <= n; k++) i = text.indexOf(';base64,', i + 1);
	return i + ';base64,'.length;
};

describe('payloadFold', () => {
	it('folds each long payload, padding included, and leaves a short one as typed', () => {
		const state = EditorState.create({ doc: deck, extensions: payloadFold() });
		expect(folds(state)).toEqual([
			[at(deck, 0), at(deck, 0) + LONG.length],
			[at(deck, 2), at(deck, 2) + LONG.length],
		]);
		expect(state.doc.toString()).toBe(deck);
	});

	it('follows an edit elsewhere, and makes or drops a fold as an edit makes or breaks a payload', () => {
		let state = EditorState.create({ doc: deck, extensions: payloadFold() });
		state = state.update({ changes: { from: 0, insert: 'Intro\n' } }).state;
		expect(folds(state).map(([a, z]) => z - a)).toEqual([LONG.length, LONG.length]);
		expect(folds(state)[0][0]).toBe(at(state.doc.toString(), 0));
		// Breaking the first payload short of the threshold drops its fold.
		const first = at(state.doc.toString(), 0);
		state = state.update({ changes: { from: first + 10, to: first + LONG.length } }).state;
		expect(folds(state)).toHaveLength(1);
		// Pasting a new picture on a new line folds it.
		state = state.update({ changes: { from: state.doc.length, insert: `\n![x](data:image/png;base64,${LONG})` } }).state;
		expect(folds(state)).toHaveLength(2);
		expect(folds(state)[1]).toEqual([at(state.doc.toString(), 3), at(state.doc.toString(), 3) + LONG.length]);
	});

	it('names the decoded size', () => {
		expect(payloadSize(6_800_000)).toBe('5.1 MB');
		expect(payloadSize(4000, 2)).toBe('3 KB');
	});
});
