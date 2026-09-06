// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { matchTheme, readColor, tokenFor } from './match-theme';

const svg = (inner: string) => `<svg viewBox="0 0 10 10">${inner}</svg>`;

describe('match the theme — the only color mechanism that reaches the PDF', () => {
	it('rewrites both fill AND stroke, which a spec-level token cannot: svg-paint sets stroke only', () => {
		const out = matchTheme(svg('<rect fill="#3366cc" stroke="#cc3366" width="4" height="4"/>'));
		expect(out).toContain('fill="var(');
		expect(out).toContain('stroke="var(');
		expect(out).not.toContain('#3366cc');
	});

	it('writes a PRESENTATION ATTRIBUTE, never inline style — style would outrank everything downstream', () => {
		const out = matchTheme(svg('<rect style="fill:#3366cc" width="4" height="4"/>'));
		expect(out).toContain('fill="var(');
		expect(out).not.toMatch(/style="[^"]*fill/);
	});

	it('maps near-black to ink and near-white to paper, so a recolored drawing is not a parrot', () => {
		const out = matchTheme(svg('<path stroke="#111111" d="M0 0 H1"/><rect fill="#fefefe" width="2" height="2"/>'));
		expect(out).toContain('stroke="var(--text-heading)"');
		expect(out).toContain('fill="var(--bg)"');
	});

	it('gives the same literal the same token, and different literals different ones', () => {
		const out = matchTheme(svg('<path stroke="#3366cc" d="M0 0 H1"/><path stroke="#3366cc" d="M1 1 H2"/><path stroke="#cc6633" d="M2 2 H3"/>'));
		const tokens = Array.from(out.matchAll(/stroke="(var\([^"]+\))"/g)).map((m) => m[1]);
		expect(tokens[0]).toBe(tokens[1]);
		expect(tokens[2]).not.toBe(tokens[0]);
	});

	it('leaves paint that is already palette-blind exactly alone', () => {
		const src = svg('<path stroke="var(--accent)" fill="none" d="M0 0 H1"/>');
		expect(matchTheme(src)).toContain('stroke="var(--accent)"');
		expect(matchTheme(src)).toContain('fill="none"');
	});

	it('does not touch a url(#gradient) reference — a gradient is not one color to map', () => {
		expect(matchTheme(svg('<rect fill="url(#g)" width="4" height="4"/>'))).toContain('fill="url(#g)"');
	});

	it('leaves a color it cannot parse rather than guessing', () => {
		expect(matchTheme(svg('<rect fill="color(display-p3 1 0 0)" width="4" height="4"/>'))).toContain('color(display-p3 1 0 0)');
	});

	it('reads the color notations an exporter actually writes', () => {
		expect(readColor('#f00')).toEqual([255, 0, 0]);
		expect(readColor('#ff0000')).toEqual([255, 0, 0]);
		expect(readColor('rgb(255, 0, 0)')).toEqual([255, 0, 0]);
		expect(readColor('rgba(255,0,0,.5)')).toEqual([255, 0, 0]);
		expect(readColor('black')).toEqual([0, 0, 0]);
		expect(readColor('not-a-color')).toBeNull();
	});

	it('assigns ramp slots in first-seen order, so the drawing decides its own palette', () => {
		const assigned = new Map<string, string>();
		expect(tokenFor('#3366cc', assigned)).toBe('var(--accent)');
		expect(tokenFor('#cc6633', assigned)).toBe('var(--cat-2-mark)');
		expect(tokenFor('#3366cc', assigned)).toBe('var(--accent)');
	});

	it('produces no hex literal anywhere in the output (HARD RULE #3 on the shipped artifact)', () => {
		const out = matchTheme(svg('<g style="stroke:#123456"><path fill="#abcdef" d="M0 0 H1"/><rect stroke="rgb(10,20,30)" width="2" height="2"/></g>'));
		expect(out).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		expect(out).not.toMatch(/rgb\(/);
	});
});
