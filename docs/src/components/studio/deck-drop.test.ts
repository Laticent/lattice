// @vitest-environment jsdom
// The shell's drop verdict (deck-drop.ts). Real DOM nodes, because the verdict reads
// `closest()` from the event target: a check on class names alone would pass while the
// Library's own drop zone, nested three levels down, was silently overridden.
import { describe, expect, it } from 'vitest';
import { deckDropVerdict } from './deck-drop';

const files = { types: ['Files'] };
const text = { types: ['text/plain'] };

function inside(html: string): Element {
	document.body.innerHTML = `<div data-studio-root>${html}</div>`;
	return document.querySelector('#t') as Element;
}

describe('deckDropVerdict', () => {
	it('takes a file drag over the plain shell', () => {
		expect(deckDropVerdict({ dataTransfer: files, target: inside('<main><p id="t">x</p></main>'), defaultPrevented: false })).toBe('import');
	});

	it('ignores a drag that carries no files (a rail reorder, dragged text)', () => {
		expect(deckDropVerdict({ dataTransfer: text, target: inside('<p id="t">x</p>'), defaultPrevented: false })).toBe('none');
		expect(deckDropVerdict({ dataTransfer: null, target: inside('<p id="t">x</p>'), defaultPrevented: false })).toBe('none');
	});

	it('stands back once an inner handler took the event', () => {
		expect(deckDropVerdict({ dataTransfer: files, target: inside('<p id="t">x</p>'), defaultPrevented: true })).toBe('owned');
	});

	it.each([
		['the Library', '<div data-file-drop><section><div><span id="t">card</span></div></section></div>'],
		['the code editor', '<div class="cm-editor"><div class="cm-content"><div id="t">line</div></div></div>'],
		['the compose editor', '<div class="ProseMirror"><p id="t">para</p></div>'],
		['an open dialog', '<div role="dialog"><button id="t">Download</button></div>'],
	])('leaves a drop on %s to its owner', (_, html) => {
		expect(deckDropVerdict({ dataTransfer: files, target: inside(html), defaultPrevented: false })).toBe('owned');
	});

	it('treats a non-element target (the document) as the plain shell', () => {
		expect(deckDropVerdict({ dataTransfer: files, target: document, defaultPrevented: false })).toBe('import');
	});
});
