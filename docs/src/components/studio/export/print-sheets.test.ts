import { describe, expect, it } from 'vitest';
import { handoutRegions, nUpCells } from '../../../playground/deck-preview.js';
import { buildSheetPrintHtml } from './print-sheets.js';

// The Print deck's sheets for 2-up, 4-up and the notes handout: the PDF's own layout, as a
// document the print frame prints (so Print opens the print dialog on every host).

const IMG = (n: number) => Array.from({ length: n }, (_, i) => `data:image/png;base64,SLIDE${i}`);
const GEOM = { w: 1280, h: 720 };
const LETTER_LAND = { pageW: 1056, pageH: 816 };

function sheets(html: string) {
	return new DOMParser().parseFromString(html, 'text/html').querySelectorAll('section.sheet');
}

describe('buildSheetPrintHtml', () => {
	it('packs N slides per sheet, in deck order, at the PDF cells', () => {
		const html = buildSheetPrintHtml(IMG(7), GEOM, LETTER_LAND, { nup: 4 });
		const s = sheets(html);
		expect(s.length).toBe(2); // 4 + 3
		expect(s[0].querySelectorAll('img').length).toBe(4);
		expect(s[1].querySelectorAll('img').length).toBe(3);
		expect(s[1].querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,SLIDE4');
		const cell = nUpCells(1280, 720, 1056, 816, 4, 'page')[1];
		expect(s[0].querySelectorAll('img')[1].getAttribute('style')).toBe(`left:${cell.x}px;top:${cell.y}px;width:${cell.w}px;height:${cell.h}px`);
	});

	it('sizes every printed page to the paper', () => {
		const html = buildSheetPrintHtml(IMG(2), GEOM, LETTER_LAND, { nup: 2 });
		expect(html).toContain('@page{size:1056px 816px;margin:0}');
		expect(sheets(html).length).toBe(1);
	});

	it('the handout puts one slide and its notes on each page, escaped as text', () => {
		const html = buildSheetPrintHtml(IMG(2), GEOM, { pageW: 816, pageH: 1056 }, { handout: true, nup: 4, notes: ['Say <b>hi</b> & smile', null] });
		const s = sheets(html);
		expect(s.length).toBe(2);
		const notes = s[0].querySelector('.notes');
		expect(notes?.textContent).toBe('Say <b>hi</b> & smile'); // text, not markup
		expect(notes?.querySelector('b')).toBeNull();
		const band = handoutRegions(1280, 720, 816, 1056, 'page').notes;
		expect(notes?.getAttribute('style')).toBe(`left:${band.x}px;top:${band.y}px;width:${band.w}px;height:${band.h}px`);
		expect(s[1].querySelector('.notes .none')?.textContent).toBe('No notes for this slide.');
	});

	it('an image source cannot break out of its attribute', () => {
		const html = buildSheetPrintHtml(['x" onerror="alert(1)'], GEOM, LETTER_LAND, { nup: 1 });
		const img = sheets(html)[0].querySelector('img');
		expect(img?.getAttribute('onerror')).toBeNull();
		expect(img?.getAttribute('src')).toBe('x" onerror="alert(1)');
	});
});
