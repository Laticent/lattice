import { describe, expect, it } from 'vitest';
import { assembleSheetPdf } from './drawing-board-export.js';

// The rasterize → assemble split (item 1 of 2026-06-14-deck-print-styling.md).
// `rasterizeDeckImages` needs a real browser rasterizer (html-to-image), so it is
// exercised on the live Studio Print drawer (HARD RULE #23), not here. This suite
// pins the DOM-free half — `assembleSheetPdf` — which is what a paper/orientation
// change re-runs, reusing cached images with NO re-rasterize.

// A valid 1×1 green PNG (jsPDF parses the real chunks, so it must be well-formed).
const PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const meta = { deck: 'probe', engine: 'lattice' };

// jsPDF's px_scaling hotfix treats 1px = 0.75pt (96dpi), so the MediaBox is the
// page's px size × 0.75 — a physically correct paper size (1344px → 1008pt = 14in).
// jsdom's Blob (jsPDF's output('blob')) has neither `.text()` nor `.arrayBuffer()`;
// read it via FileReader as a binary string. MediaBox/page dicts are uncompressed
// ASCII, so they survive the byte→char mapping — only streams deflate.
function decode(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error);
		r.readAsBinaryString(blob);
	});
}
function mediaBoxes(text: string): string[] {
	return text.match(/\/MediaBox\s*\[[^\]]*\]/g) || [];
}
function pageCount(text: string): number {
	return (text.match(/\/Type\s*\/Page(?![s])/g) || []).length;
}

describe('assembleSheetPdf — place cached images on a paper sheet', () => {
	it('emits one page per image at the sheet MediaBox (px × 0.75 = pt)', async () => {
		const blob = await assembleSheetPdf([PNG, PNG, PNG], { w: 1280, h: 720 }, 'probe', meta, {
			sheet: { pageW: 1344, pageH: 816 }, // US Legal landscape
			pageFormat: 'png',
		});
		expect(blob.type).toBe('application/pdf');
		const text = await decode(blob);
		expect(pageCount(text)).toBe(3);
		// 1344 × 0.75 = 1008pt (14in) wide; 816 × 0.75 = 612pt (8.5in) tall — real US Legal landscape.
		for (const box of mediaBoxes(text)) {
			expect(box).toMatch(/1008/);
			expect(box).toMatch(/612/);
		}
	});

	it('re-places the SAME images onto a different sheet — the MediaBox flips, no re-rasterize', async () => {
		const images = [PNG, PNG];
		const geom = { w: 1280, h: 720 };
		// Same images (as a paper/orientation change would reuse) → two different sheets.
		const legal = await decode(await assembleSheetPdf(images, geom, 'p', meta, { sheet: { pageW: 1344, pageH: 816 }, pageFormat: 'png' }));
		const a4Portrait = await decode(await assembleSheetPdf(images, geom, 'p', meta, { sheet: { pageW: 794, pageH: 1123 }, pageFormat: 'png' }));
		// 794 × 0.75 ≈ 596pt wide, 1123 × 0.75 ≈ 842pt tall — A4 portrait, distinct from Legal landscape.
		expect(mediaBoxes(legal)[0]).toMatch(/1008/);
		expect(mediaBoxes(a4Portrait)[0]).toMatch(/84[12]/); // ~842pt tall (A4)
		expect(mediaBoxes(a4Portrait)[0]).not.toMatch(/1008/);
		expect(pageCount(legal)).toBe(2);
		expect(pageCount(a4Portrait)).toBe(2);
	});

	it('throws without a sheet (the assemble half needs page geometry)', async () => {
		await expect(assembleSheetPdf([PNG], { w: 1280, h: 720 }, 'p', meta, { pageFormat: 'png' })).rejects.toThrow(/sheet/);
	});
});
