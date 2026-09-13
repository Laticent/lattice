import { describe, expect, it } from 'vitest';
import { addPageStickyNotes, stickyNotePlacements } from './pdf-sticky-notes.js';

type Ann = { type: string; title: string; contents: string; bounds: { x: number; y: number; w: number; h: number }; open: boolean };

// A minimal jsPDF stand-in capturing createAnnotation calls — the contract both
// PDF lanes rely on (worker + main-thread), so a lane can't silently diverge. The
// method param is `object` to match the helper's structural type; we narrow inside.
function fakePdf() {
	const calls: Ann[] = [];
	return { calls, createAnnotation(a: object) { calls.push(a as Ann); } };
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

describe('stickyNotePlacements', () => {
	const note = (i: number) => ({ title: 'reviewer', contents: 'note ' + i });

	it('stacks down the top-right corner', () => {
		const [first, second] = stickyNotePlacements([note(0), note(1)], 1280, 720);
		expect(first.x).toBe(1280 - 14 - 22);
		expect(first.y).toBe(14);
		expect(second.y).toBe(14 + 28);
		expect(second.x).toBe(first.x);
	});

	it('wraps into another column rather than running off the page', () => {
		// Without wrapping the stack walks off the bottom: a rect outside the MediaBox,
		// which a reader may drop or draw off-canvas.
		const many = Array.from({ length: 27 }, (_, i) => note(i));
		const placed = stickyNotePlacements(many, 1280, 720);
		expect(placed).toHaveLength(27);
		for (const p of placed) {
			expect(p.y + p.h).toBeLessThanOrEqual(720);
			expect(p.x).toBeGreaterThanOrEqual(14);
		}
		// 720px holds 24 at a 28px step (a 14px inset top and bottom), so the 25th note
		// starts the next column, level with the first.
		expect(placed[24].x).toBe(placed[0].x - 28);
		expect(placed[24].y).toBe(placed[0].y);
	});

	it('keeps one column when no page height is offered', () => {
		const placed = stickyNotePlacements([note(0), note(1), note(2)], 1280);
		expect(new Set(placed.map((p) => p.x)).size).toBe(1);
	});
});
