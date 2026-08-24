import { describe, expect, it } from 'vitest';
import { paintStageTokens, STAGE_CHROME_CSS, stageChromeDecls, stageChromeTokens } from './stage-chrome.js';

// ── The audience chrome's palette ────────────────────────────────────────────
//
// This exists because the first version shipped the OPENER's tokens verbatim, and
// the Stage's letterbox is dark in both modes — so a light-mode app painted dark
// text on a near-black surround and the caption crawl was unreadable for a whole
// room (2026-08-24-stage-console-split.md §8). The rule now is that every value is
// resolved against the LETTERBOX, and the accent is measured rather than trusted.

/** WCAG relative luminance / contrast, written out so the test does not share the
 *  implementation's arithmetic — if both were wrong in the same way, neither would say so. */
function ratio(a: [number, number, number], b: [number, number, number]): number {
	const lin = (c: number) => {
		const x = c / 255;
		return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	};
	const lum = ([r, g, bl]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
	const la = lum(a);
	const lb = lum(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const rgb = (v: string): [number, number, number] => {
	const m = v.match(/-?[\d.]+/g);
	if (!m || m.length < 3) throw new Error(`not a resolved color: "${v}"`);
	return [Number(m[0]), Number(m[1]), Number(m[2])];
};

/** A stand-in for the two documents: an opener whose `--accent` is `accent`, and a Stage root. */
function paint(accent: string, letterbox: string) {
	const from = document.documentElement;
	from.style.setProperty('--accent', accent);
	const root = document.createElement('html');
	paintStageTokens(root, from, letterbox);
	from.style.removeProperty('--accent');
	return (name: string) => root.style.getPropertyValue(name);
}

describe('stage-chrome — paintStageTokens', () => {
	it('lightens a light-mode accent until it clears the dark letterbox', () => {
		// cuoio's light accent measures 2.4:1 on the letterbox — legible on the app's own
		// background and not on this one. It is the spoken word in the caption crawl and the
		// rail's progress fill, so "close enough" is a room that cannot read either.
		const LETTERBOX: [number, number, number] = [21, 17, 13]; // #15110d
		expect(ratio([122, 90, 16], LETTERBOX)).toBeLessThan(4.5); // the premise, pinned
		const token = paint('#7a5a10', '#15110d');
		expect(ratio(rgb(token('--accent')), LETTERBOX)).toBeGreaterThanOrEqual(4.5);
	});

	it('leaves an accent that already clears the letterbox alone', () => {
		// Only the failing case is adjusted. A palette whose accent is already legible on a
		// dark surround must reach the room as ITSELF — washing every accent toward white
		// would cost the deck its brand for no measured reason.
		const token = paint('#e8c46a', '#15110d');
		expect(rgb(token('--accent'))).toEqual([232, 196, 106]);
	});

	it('derives the text ramp from the letterbox, not from the app', () => {
		const LETTERBOX: [number, number, number] = [12, 12, 12]; // #0c0c0c, the dark-mode surround
		const token = paint('#7a5a10', '#0c0c0c');
		// The on-dark rungs the themes use for text on a dark canvas: 90% and 65% white.
		expect(ratio(rgb(token('--text-heading')), LETTERBOX)).toBeGreaterThan(12);
		expect(ratio(rgb(token('--text-muted')), LETTERBOX)).toBeGreaterThanOrEqual(4.5);
		// `--bg` IS the letterbox — the rail's measured `color-mix(accent …, bg)` ladder
		// blends toward the real surround rather than toward the app's page color.
		expect(rgb(token('--bg'))).toEqual(LETTERBOX);
	});

	it('resolves a token that is not a plain hex', () => {
		// A palette may be written as `color-mix(…)` or `light-dark(…)`, and a custom
		// property carries its TEXT, not a color — copying that across would land an
		// expression in a document whose cascade cannot resolve it.
		const token = paint('rgb(122, 90, 16)', '#15110d');
		expect(token('--accent')).toMatch(/^rgb\(/);
	});

	it('survives a root with no accent at all', () => {
		// The Drawing Board case, and any surface that forwards nothing: a fallback gold
		// rather than a throw or an unpainted band.
		const root = document.createElement('html');
		paintStageTokens(root, document.documentElement, '#15110d');
		expect(rgb(root.style.getPropertyValue('--accent'))).toHaveLength(3);
	});

	it('bakes a legible palette with no live root at all — the document ships self-sufficient', () => {
		// The painter runs in an effect AFTER the Stage says ready, and the audience chrome
		// renders in that same commit: for that window `--text-muted` was unset, so
		// `color-mix(in srgb, var(--text-muted) 45%, transparent)` was an INVALID color and
		// fell back to `canvastext` — black on a near-black letterbox, measured on the real
		// popup at 1.12:1. So the values are computed with no DOM and baked into the built
		// document; nothing has to arrive later for the room to be able to read it.
		const LETTERBOX: [number, number, number] = [21, 17, 13];
		const t = stageChromeTokens(LETTERBOX, [122, 90, 16]);
		expect(ratio(rgb(t['--text-heading']), LETTERBOX)).toBeGreaterThan(12);
		expect(ratio(rgb(t['--accent']), LETTERBOX)).toBeGreaterThanOrEqual(4.5);
		// And as a declaration body a `<style>` can carry.
		const decls = stageChromeDecls(LETTERBOX, [122, 90, 16]);
		expect(decls).toContain('--text-heading:');
		expect(decls).toContain('--text-muted:');
		expect(decls.endsWith(';')).toBe(true);
	});

	it('is one stylesheet, and it names both hosts', () => {
		expect(STAGE_CHROME_CSS).toContain('.latt-cc-band');
		expect(STAGE_CHROME_CSS).toContain('.latt-rail-seg');
		// No font-family here: the sheet is injected into the CONSOLE too, where a stack
		// would overwrite the site's own. The Stage states one on `#latt-chrome` instead.
		expect(STAGE_CHROME_CSS).not.toContain('font-family');
	});
});
