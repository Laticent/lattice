import { describe, expect, it } from 'vitest';
import { addPageStickyNotes } from './pdf-sticky-notes.js';

// A minimal jsPDF stand-in capturing createAnnotation calls — the contract both
// PDF lanes rely on (worker + main-thread), so a lane can't silently diverge.
function fakePdf() {
	const calls: Array<{ type: string; title: string; contents: string; bounds: { x: number; y: number; w: number; h: number }; open: boolean }> = [];
	return { calls, createAnnotation(a: (typeof calls)[number]) { calls.push(a); } };
}

describe('pdf-sticky-notes', () => {
	it('writes one text annotation per comment, stacked down the top-right', () => {
		const pdf = fakePdf();
		addPageStickyNotes(pdf, [
			{ title: 'Ada', contents: 'Check this figure' },
			{ title: 'Ben · resolved', contents: 'Fixed now' },
		], 1280);
		expect(pdf.calls).toHaveLength(2);
		for (const c of pdf.calls) {
			expect(c.type).toBe('text');
			expect(c.open).toBe(false);
			expect(c.bounds.x).toBeGreaterThan(1280 - 60); // hugs the right edge
		}
		expect(pdf.calls[0].title).toBe('Ada');
		expect(pdf.calls[0].contents).toBe('Check this figure');
		expect(pdf.calls[1].title).toMatch(/resolved/);
		expect(pdf.calls[1].bounds.y).toBeGreaterThan(pdf.calls[0].bounds.y); // stacked below
	});

	it('no-ops on an empty or absent slide', () => {
		const pdf = fakePdf();
		addPageStickyNotes(pdf, undefined, 1280);
		addPageStickyNotes(pdf, [], 1280);
		expect(pdf.calls).toHaveLength(0);
	});

	it('skips a note with no body (never writes an empty sticky)', () => {
		const pdf = fakePdf();
		addPageStickyNotes(pdf, [{ title: 'x', contents: '' }, { title: 'y', contents: 'real' }], 1280);
		expect(pdf.calls).toHaveLength(1);
		expect(pdf.calls[0].contents).toBe('real');
	});
});
