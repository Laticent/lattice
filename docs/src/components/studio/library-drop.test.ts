// Unit: which dropped file goes to which of the Library's two ingests (#1655).
//
// The drag wiring itself (dragenter/over/leave counting, the overlay, dropEffect) is
// DOM behavior verified on the real Studio — jsdom has no drag. What is plain logic,
// and what a future edit is most likely to get wrong, is the routing: a `.zip` is a
// lattice-asset bundle, a `.md` is a reference file, and anything else has to be named
// rather than silently swallowed.

import { describe, expect, it } from 'vitest';
import { classifyDropped, rejectedMessage } from './Library';
import { REF_DOC_ACCEPT } from './reference-doc';

const file = (name: string) => new File(['x'], name);

describe('classifyDropped', () => {
	it('sends a .zip to the bundle import and a reference file to the doc store', () => {
		const { zips, docs, rejected } = classifyDropped([file('lattice-assets.zip'), file('notes.md')]);
		expect(zips.map((f) => f.name)).toEqual(['lattice-assets.zip']);
		expect(docs.map((f) => f.name)).toEqual(['notes.md']);
		expect(rejected).toEqual([]);
	});

	it('routes every extension the picker accepts', () => {
		const exts = REF_DOC_ACCEPT.split(',').map((e) => e.trim()).filter((e) => e.startsWith('.'));
		expect(exts.length).toBeGreaterThan(0);
		const { docs, rejected } = classifyDropped(exts.map((e) => file(`sample${e}`)));
		expect(docs).toHaveLength(exts.length);
		expect(rejected).toEqual([]);
	});

	it('is case-insensitive — a .ZIP from Windows is still a bundle', () => {
		const { zips, docs } = classifyDropped([file('BUNDLE.ZIP'), file('NOTES.MD')]);
		expect(zips).toHaveLength(1);
		expect(docs).toHaveLength(1);
	});

	it('rejects what neither ingest takes, and an extensionless file', () => {
		const { zips, docs, rejected } = classifyDropped([file('photo.png'), file('Makefile')]);
		expect(zips).toEqual([]);
		expect(docs).toEqual([]);
		expect(rejected.map((f) => f.name)).toEqual(['photo.png', 'Makefile']);
	});

	it('reads the extension from the END of the name, not the first dot', () => {
		// `deck.md.zip` is a zip. A `split('.')[1]` reading would call it markdown and hand
		// binary zip bytes to the text reader.
		const { zips, docs } = classifyDropped([file('deck.md.zip'), file('my.notes.md')]);
		expect(zips.map((f) => f.name)).toEqual(['deck.md.zip']);
		expect(docs.map((f) => f.name)).toEqual(['my.notes.md']);
	});

	it('splits a mixed drop instead of taking the first kind and dropping the rest', () => {
		const { zips, docs, rejected } = classifyDropped([file('a.zip'), file('b.md'), file('c.png'), file('d.zip')]);
		expect(zips).toHaveLength(2);
		expect(docs).toHaveLength(1);
		expect(rejected).toHaveLength(1);
	});
});

describe('rejectedMessage', () => {
	it('names what was refused', () => {
		expect(rejectedMessage(['photo.png'])).toContain('photo.png');
		expect(rejectedMessage(['photo.png'])).toContain(REF_DOC_ACCEPT);
	});

	it('caps the list at three so a folder drop is not a wall of text', () => {
		const msg = rejectedMessage(['a.png', 'b.png', 'c.png', 'd.png', 'e.png']);
		expect(msg).toContain('a.png, b.png, c.png');
		expect(msg).toContain('and 2 more');
		expect(msg).not.toContain('d.png');
	});
});
