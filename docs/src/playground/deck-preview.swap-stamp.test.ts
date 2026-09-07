/**
 * The filmstrip host's half of the stamp contract. See
 * docs/src/lib/single-slide-render.swap-stamp.test.ts for why this file exists at all:
 * before it, deleting the host-side answer in BOTH preview hosts left every suite green.
 *
 * `patchSections` used to ask only whether the slide COUNT had changed, and stamped
 * `in-place` whenever it had not. A reorder keeps the count. Pasting a different deck of
 * the same length keeps the count. Both were licensed to hold one slide's diagram in
 * another slide's box — which is the defect the stamp was introduced to prevent.
 */

import { describe, expect, it } from 'vitest';
import { patchSections } from './deck-preview.js';

const section = (id: number, title: string) => `<section class="form" id="${id}"><div class="cell-stage"><h1>${title}</h1></div></section>`;

/** A stand-in for the preview iframe: only `contentDocument` is reached by patchSections. */
function frameShowing(sections: string[]) {
	const doc = document.implementation.createHTMLDocument('preview');
	doc.body.innerHTML = `<article class="lattice">${sections.join('')}</article>`;
	return { contentDocument: doc, contentWindow: {} } as unknown as HTMLIFrameElement;
}
const stampOf = (frame: HTMLIFrameElement) => frame.contentDocument?.querySelector('.lattice')?.getAttribute('data-lattice-swap') ?? null;

const A = section(1, 'alpha');
const B = section(2, 'bravo');
const C = section(3, 'charlie');

describe('patchSections stamps the swap kind before it writes', () => {
	it('EDITING one slide stamps in-place', () => {
		const frame = frameShowing([A, B, C]);
		const next = [A, section(2, 'bravo edited'), C];
		expect(patchSections(frame, next, [A, B, C])).toBe(true);
		expect(stampOf(frame)).toBe('in-place');
	});

	it('REORDERING stamps reflow — equal counts are not equal decks', () => {
		const frame = frameShowing([A, B, C]);
		expect(patchSections(frame, [A, C, B], [A, B, C])).toBe(true);
		expect(stampOf(frame)).toBe('reflow');
	});

	it('pasting a DIFFERENT DECK of the same length stamps reflow', () => {
		const frame = frameShowing([A, B, C]);
		const other = [section(1, 'zulu'), section(2, 'yankee'), section(3, 'xray')];
		expect(patchSections(frame, other, [A, B, C])).toBe(true);
		expect(stampOf(frame)).toBe('reflow');
	});

	it('adding a slide stamps reflow, and still rebuilds the body', () => {
		const frame = frameShowing([A, B]);
		expect(patchSections(frame, [A, B, C], [A, B])).toBe(true);
		expect(stampOf(frame)).toBe('reflow');
		expect(frame.contentDocument?.querySelectorAll('.lattice > section').length).toBe(3);
	});

	it('a FIRST render, with no previous sections to compare, stamps reflow', () => {
		const frame = frameShowing([A, B, C]);
		expect(patchSections(frame, [A, B, C], undefined)).toBe(true);
		expect(stampOf(frame)).toBe('reflow');
	});
});
