// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_PART_PLAN, type Plan, planToScene } from './plan';
import { reconcile, remapPlan } from './reconcile';
import { labelArt, posterBytes, posterFits, slideSkeleton } from './skeleton';
import { type IntakePart, intake } from './svg-intake';

const part = (over: Partial<IntakePart>): IntakePart => ({ pathRef: 'x', label: 'X', tag: 'path', drawable: true, strokeable: true, band: false, childCount: 0, ...over });

describe('replace is a diff — a geometry edit must not erase twenty parts of work', () => {
	it('matches by label first, because a name survives the edit that broke the ids', () => {
		const before = [part({ pathRef: 'a1', label: 'Frame' }), part({ pathRef: 'a2', label: 'Rule' })];
		const after = [part({ pathRef: 'b9', label: 'Rule' }), part({ pathRef: 'b7', label: 'Frame' })];
		const r = reconcile(before, after);
		expect(r.matched).toBe(2);
		expect(r.remap.get('a1')).toBe('b7');
		expect(r.remap.get('a2')).toBe('b9');
		expect(r.entries.every((e) => e.how === 'label')).toBe(true);
	});

	it('falls back to structure when the part was renamed', () => {
		const before = [part({ pathRef: 'a1', label: 'Old name', tag: 'rect' })];
		const after = [part({ pathRef: 'b1', label: 'New name', tag: 'rect' })];
		const r = reconcile(before, after);
		expect(r.matched).toBe(1);
		expect(r.entries[0].how).toBe('structure');
	});

	it('falls back to ordinal position last, and only when the tag agrees', () => {
		const before = [part({ pathRef: 'a1', label: 'One', tag: 'path', childCount: 3 })];
		const after = [part({ pathRef: 'b1', label: 'Two', tag: 'path', childCount: 9 })];
		expect(reconcile(before, after).entries[0].how).toBe('ordinal');

		const tagChanged = reconcile(before, [part({ pathRef: 'b1', label: 'Two', tag: 'circle', childCount: 9 })]);
		expect(tagChanged.entries.find((e) => e.previous === 'a1')?.how).toBe('gone');
	});

	it('reports what is new and what is gone rather than dropping either silently', () => {
		const before = [part({ pathRef: 'a1', label: 'Kept' }), part({ pathRef: 'a2', label: 'Removed' })];
		const after = [part({ pathRef: 'b1', label: 'Kept' }), part({ pathRef: 'b2', label: 'Added', tag: 'circle' })];
		const r = reconcile(before, after);
		expect(r.matched).toBe(1);
		expect(r.added).toBe(1);
		expect(r.dropped).toBe(1);
		expect(r.summary).toBe('1 part matched, 1 is new, 1 is gone — its beat was dropped');
		expect(r.entries.find((e) => e.how === 'gone')?.previousLabel).toBe('Removed');
	});

	it('never pairs one new part with two old ones', () => {
		const before = [part({ pathRef: 'a1', label: 'Same' }), part({ pathRef: 'a2', label: 'Same' })];
		const after = [part({ pathRef: 'b1', label: 'Same' })];
		const r = reconcile(before, after);
		expect(new Set(r.remap.values()).size).toBe(r.remap.size);
		expect(r.dropped).toBe(1);
	});

	it('an unchanged re-paste matches everything', () => {
		const src = '<svg viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg"><path id="a" d="M0 0 H5" stroke="var(--accent)"/><rect id="b" width="4" height="4" stroke="var(--accent)"/></svg>';
		const a = intake(src);
		const b = intake(src);
		if (!a.ok || !b.ok) throw new Error('intake refused');
		const r = reconcile(a.parts, b.parts);
		expect(r.matched).toBe(a.parts.length);
		expect(r.dropped).toBe(0);
		expect(r.added).toBe(0);
	});

	it('remapPlan carries the choreography across and drops only what is gone', () => {
		const plan: Plan = new Map([
			['a1', { ...DEFAULT_PART_PLAN, beat: 2, role: 'draw' }],
			['a2', { ...DEFAULT_PART_PLAN, beat: 3 }],
		]);
		const remapped = remapPlan(plan, new Map([['a1', 'b7']]));
		expect(remapped.get('b7')).toEqual({ ...DEFAULT_PART_PLAN, beat: 2, role: 'draw' });
		expect(remapped.has('a2')).toBe(false);
		expect(plan.size, 'the input plan is not mutated').toBe(2);
	});
});

describe('the slide a motion asset lands on', () => {
	const artOf = (svg: string) => {
		const r = intake(svg);
		if (!r.ok) throw new Error(r.message);
		return r;
	};
	const src = '<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"><path id="n1" d="M0 0 H10" stroke="var(--accent)"/><path id="n2" d="M20 0 H30" stroke="var(--accent)"/></svg>';

	it('writes the scene class, the heading, the poster and the fence', () => {
		const { art, parts, viewBox } = artOf(src);
		const spec = planToScene(parts, new Map(parts.map((p) => [p.pathRef, DEFAULT_PART_PLAN])), 'calm', 'flow', viewBox);
		const md = slideSkeleton({ label: 'Value chain', art, spec });
		expect(md).toContain('<!-- _class: scene -->');
		expect(md).toContain('## Value chain');
		expect(md).toContain('```anima');
		expect(md).toContain('"source": "svg"');
	});

	it('puts the poster on ONE line — markdown block-HTML ends at a blank line', () => {
		const { art, parts, viewBox } = artOf(src);
		const spec = planToScene(parts, new Map(), 'calm', 'flow', viewBox);
		const md = slideSkeleton({ label: 'Flow', art, spec });
		const posterLine = md.split('\n').find((l) => l.trim().startsWith('<svg'));
		expect(posterLine).toBeTruthy();
		expect(posterLine).toContain('</svg>');
	});

	it('the shipped graphic carries its own accessible name', () => {
		const { art, parts, viewBox } = artOf(src);
		const spec = planToScene(parts, new Map(), 'calm', 'flow', viewBox);
		const md = slideSkeleton({ label: 'Value chain', description: 'Five stages', art, spec });
		expect(md).toContain('role="img"');
		expect(md).toContain('<title>Value chain</title>');
		expect(md).toContain('<desc>Five stages</desc>');
	});

	it('replaces an existing title rather than leaving two, which makes the name ambiguous', () => {
		const twice = labelArt(labelArt('<svg viewBox="0 0 1 1"><path d="M0 0 H1"/></svg>', 'First'), 'Second');
		expect(twice.match(/<title>/g)).toHaveLength(1);
		expect(twice).toContain('<title>Second</title>');
	});

	it('escapes a label that would otherwise open a tag', () => {
		const out = labelArt('<svg viewBox="0 0 1 1"><path d="M0 0 H1"/></svg>', '<script>alert(1)</script>');
		expect(out).not.toContain('<script');
		expect(out).toContain('&lt;script&gt;');
	});

	// The fence is the SAME scene with re-instanced ids — not the same object. Insert mints a fresh
	// namespace per copy (`reinstance`), because two inserts of one drawing otherwise carry identical
	// ids into one rendered document. So the invariant worth pinning is that the fence and the poster
	// on the SAME slide still address each other, and that nothing but the ids moved.
	it('the fence it writes parses back to the same scene, re-instanced and still addressable', () => {
		const { art, parts, viewBox } = artOf(src);
		const spec = planToScene(parts, new Map(parts.map((p) => [p.pathRef, { ...DEFAULT_PART_PLAN, role: 'draw' as const }])), 'brisk', 'flow', viewBox);
		const md = slideSkeleton({ label: 'Flow', art, spec });
		const fence = md.slice(md.indexOf('```anima') + 8, md.lastIndexOf('```')).trim();
		const back = JSON.parse(fence);

		// Every part still resolves to an element in this slide's own poster.
		const els = (sc: unknown) => (sc as { elements: { id: string; pathRef: string }[] }).elements;
		expect(els(back)).toHaveLength(els(spec).length);
		for (const e of els(back)) expect(md).toContain(`id="${e.pathRef}"`);

		// And nothing but the ids moved.
		const strip = (sc: unknown) => ({ ...(sc as object), elements: els(sc).map(({ id: _i, pathRef: _p, ...rest }) => rest) });
		expect(strip(back)).toEqual(strip(spec));
	});

	it('two inserts of one drawing do not collide — the render-ids invariant, at the seam that owns it', () => {
		const { art, parts, viewBox } = artOf(src);
		const spec = planToScene(parts, new Map(parts.map((p) => [p.pathRef, { ...DEFAULT_PART_PLAN, role: 'draw' as const }])), 'brisk', 'flow', viewBox);
		const idsOf = (md: string) => new Set(Array.from(md.matchAll(/\sid="([^"]+)"/g), (m) => m[1]));
		const a = idsOf(slideSkeleton({ label: 'Flow', art, spec }));
		const b = idsOf(slideSkeleton({ label: 'Flow', art, spec }));
		expect(a.size).toBeGreaterThan(0);
		for (const id of b) expect(a.has(id)).toBe(false);
	});
});

describe('the poster is what the ceiling has to bind', () => {
	it('measures the poster, which is bigger than the art it is made from', () => {
		const r = intake('<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path id="a" d="M0 0 H5" stroke="var(--accent)"/></svg>');
		if (!r.ok) throw new Error(r.message);
		const bytes = posterBytes({ label: 'Value chain', description: 'Five stages of it', art: r.art });
		// The poster carries the art PLUS role="img" and the accessible name — so it is strictly
		// larger, and refusing on the art alone left the thing that lands on the slide unmeasured.
		expect(bytes).toBeGreaterThan(r.receipt.artBytes);
		expect(posterFits({ label: 'Value chain', art: r.art })).toBe(true);
	});

	it('refuses a poster over the ceiling even when the art squeaks under it', () => {
		const big = `<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><path id="a" d="M0 0 H5" stroke="var(--accent)"/></svg>`;
		const r = intake(big);
		if (!r.ok) throw new Error(r.message);
		expect(posterFits({ label: 'x'.repeat(20), description: 'y'.repeat(80_000), art: r.art })).toBe(false);
	});
});
