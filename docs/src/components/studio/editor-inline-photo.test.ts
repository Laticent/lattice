// @vitest-environment node
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { CHIP_MIN_PAYLOAD, longPayloads, payloadSize, photoChips } from './editor-inline-photo';

// The photo chip is a state field (editor-inline-photo.ts says why): it must cover each long payload, follow an edit
// elsewhere, re-read the line an edit touches, and go when the payload goes.
const payload = (n: number, c = 'Q') => c.repeat(n);
const photo = (n = CHIP_MIN_PAYLOAD + 10) => `data:image/jpeg;base64,${payload(n)}`;
const chips = (state: EditorState) => {
	const out: Array<[number, number]> = [];
	state.field(photoChips).between(0, state.doc.length, (from, to) => {
		out.push([from, to]);
	});
	return out;
};
const stateOf = (doc: string) => EditorState.create({ doc, extensions: [photoChips] });

describe('longPayloads', () => {
	it('finds each long base64 run after `;base64,`, and nothing shorter', () => {
		const line = `![a](${photo()}) ![b](data:image/png;base64,${payload(100)}) ![c](${photo(CHIP_MIN_PAYLOAD)})`;
		const found = longPayloads(line);
		expect(found).toHaveLength(2);
		for (const [a, z] of found) expect(line.slice(a, z)).toMatch(/^Q+$/);
	});
	it('says the decoded size', () => {
		expect(payloadSize(4_000_000)).toBe('3.0 MB');
		expect(payloadSize(4000)).toBe('3 KB');
	});
});

describe('photoChips', () => {
	it('covers the payload, follows an edit elsewhere, and re-reads the line an edit touches', () => {
		const doc = `# T\n\n![bg](${photo()})\n\nText`;
		let state = stateOf(doc);
		const at = doc.indexOf(';base64,') + 8;
		expect(chips(state)).toEqual([[at, at + CHIP_MIN_PAYLOAD + 10]]);
		// An edit above moves the chip with the text.
		state = state.update({ changes: { from: 0, insert: 'xx' } }).state;
		expect(chips(state)).toEqual([[at + 2, at + 2 + CHIP_MIN_PAYLOAD + 10]]);
		// Typing on the photo line, after the image, keeps one chip over the same payload.
		const end = state.doc.line(3).to;
		state = state.update({ changes: { from: end, insert: ' caption' } }).state;
		expect(chips(state)).toEqual([[at + 2, at + 2 + CHIP_MIN_PAYLOAD + 10]]);
		// A second photo pasted on a new line gets its own chip.
		state = state.update({ changes: { from: state.doc.length, insert: `\n\n![b](${photo()})` } }).state;
		expect(chips(state)).toHaveLength(2);
		// Deleting the first image line removes its chip, and only it.
		const l3 = state.doc.line(3);
		state = state.update({ changes: { from: l3.from, to: l3.to } }).state;
		expect(chips(state)).toHaveLength(1);
	});

	it('a deck with no photo has no chip', () => {
		expect(chips(stateOf('# T\n\n![a](data:image/png;base64,QUJD)\n'))).toEqual([]);
	});
});
