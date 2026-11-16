import { describe, expect, it } from 'vitest';
import { fmEntries, keysDiffer, revertKeys, touchedKeys } from './deck-reset';

const deck = (fm: string, body = '# One\n\n---\n\n# Two\n') => `---\n${fm}\n---\n\n${body}`;

describe('deck reset: only the keys the pane changed go back', () => {
	it('groups a key with its indented lines, and keeps comments as their own entries', () => {
		const e = fmEntries('theme: cuoio\nlexicon:\n  a: b\n  c: d\n# a note\npaginate: true');
		expect(e.map((x) => x.key)).toEqual(['theme', 'lexicon', null, 'paginate']);
		expect(e[1].lines).toEqual(['lexicon:', '  a: b', '  c: d']);
	});

	it('names the keys a write added, removed or changed', () => {
		expect(touchedKeys(deck('theme: cuoio\npaginate: true'), deck('theme: indaco\nfooter: Q3'))).toEqual(['theme', 'paginate', 'footer']);
		expect(touchedKeys(deck('theme: cuoio'), deck('theme: cuoio'))).toEqual([]);
	});

	it("reverts the pane's keys and keeps everyone else's edits, the body and the order", () => {
		const base = deck('theme: cuoio\npaginate: true\nviews:\n  exec: [1]');
		// The pane turned page numbers off; meanwhile the editor added a view and a collaborator changed the footer.
		const now = deck('theme: cuoio\npaginate: false\nviews:\n  exec: [1]\n  board: [2]\nfooter: Q4', '# One edited\n');
		const out = revertKeys(now, base, ['paginate']);
		expect(out).toBe(deck('theme: cuoio\npaginate: true\nviews:\n  exec: [1]\n  board: [2]\nfooter: Q4', '# One edited\n'));
		expect(keysDiffer(out, base, ['paginate'])).toBe(false);
	});

	it('removes a key the visit added, and brings back one the visit removed', () => {
		expect(revertKeys(deck('theme: cuoio\nheader: Draft'), deck('theme: cuoio'), ['header'])).toBe(deck('theme: cuoio'));
		const back = revertKeys(deck('theme: cuoio'), deck('theme: cuoio\nheader: Draft'), ['header']);
		expect(back).toBe(deck('theme: cuoio\nheader: Draft'));
	});

	it('drops a block the visit created when the reset empties it, and leaves the body flush', () => {
		const body = '# One\n';
		expect(revertKeys(`---\npaginate: true\n---\n\n${body}`, body, ['paginate'])).toBe(body);
	});

	it('restores a block-valued key whole', () => {
		const base = deck('lexicon:\n  KPI: key performance indicator');
		const now = deck('lexicon:\n  KPI: changed\n  ARR: annual');
		expect(revertKeys(now, base, touchedKeys(base, now))).toBe(base);
	});

	it("keeps the source's own line endings", () => {
		const crlf = (fm: string) => `---\r\n${fm.split('\n').join('\r\n')}\r\n---\r\n\r\n# One\r\n`;
		expect(revertKeys(crlf('theme: indaco\nsize: 16:9'), crlf('theme: cuoio\nsize: 16:9'), ['theme'])).toBe(crlf('theme: cuoio\nsize: 16:9'));
	});

	it('reads a list written flush under its key as part of that key', () => {
		expect(touchedKeys(deck('tags:\n- a\n- b'), deck('tags:\n- c'))).toEqual(['tags']);
		expect(revertKeys(deck('tags:\n- c\ntheme: x'), deck('tags:\n- a\n- b\ntheme: x'), ['tags'])).toBe(deck('tags:\n- a\n- b\ntheme: x'));
	});

	it('sees a quoted key', () => {
		expect(touchedKeys(deck('"theme": cuoio'), deck('"theme": indaco'))).toEqual(['theme']);
	});

	it('puts a key the visit removed back in its place', () => {
		const base = deck('# deck\nsize: 16:9\nheader: Draft\ntheme: cuoio');
		expect(revertKeys(deck('# deck\nsize: 16:9\ntheme: cuoio'), base, ['header'])).toBe(base);
	});

	it('brings back a block the visit removed whole, in its own shape', () => {
		const base = '---\ntheme: cuoio\n---\n# One\n';
		expect(revertKeys('# One\n', base, ['theme'])).toBe(base);
	});

	it('is a no-op with no keys', () => {
		const s = deck('theme: cuoio');
		expect(revertKeys(s, deck('theme: indaco'), [])).toBe(s);
	});
});
