import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck } from './deck-doc';
import { setListMarker } from './marker-commands';

const DECK = ['<!-- _class: checklist -->', '', '## Gates', '', '- [x] Security', '- [!] Pricing', '- plain item', '', '---', '', '<!-- _class: checklist -->', '', '## Locked', '', '- [ ] Has ~~strike~~'].join('\n');

/** The position of the `[` that leads the list item whose text contains `word`. */
function markerPos(state: EditorState, word: string): number {
	let found = -1;
	state.doc.descendants((node, pos) => {
		if (found < 0 && node.isText && node.text?.includes(word)) found = pos;
		return found < 0;
	});
	return found;
}

function run(token: string, word: string, source = DECK) {
	const state = EditorState.create({ doc: deckToDoc(source) });
	const pos = markerPos(state, word);
	expect(pos).toBeGreaterThanOrEqual(0);
	let next = state;
	const ok = setListMarker(pos, token)(state, (tr) => {
		next = state.apply(tr);
	});
	return { ok, out: docToDeck(next.doc) };
}

describe('setListMarker', () => {
	it('writes any of the six, and only those three bytes', () => {
		for (const t of ['[ ]', '[-]', '[!]', '[?]', '[/]', '[x]']) {
			const r = run(t, 'Pricing');
			expect(r.ok).toBe(true);
			expect(r.out).toBe(docToDeck(deckToDoc(DECK)).replace('- [!] Pricing', `- ${t} Pricing`));
		}
	});
	it('refuses a token that is not one of the six', () => {
		expect(run('[X]', 'Pricing').ok).toBe(false);
		expect(run('[*]', 'Pricing').ok).toBe(false);
	});
	it('refuses where no marker leads the item, and on a locked slide', () => {
		expect(run('[x]', 'plain item').ok).toBe(false);
		expect(run('[x]', 'Has').ok).toBe(false);
	});
});
