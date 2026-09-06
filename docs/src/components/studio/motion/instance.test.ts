// @vitest-environment jsdom
// The insert seam: a stored drawing is a template, and every copy of it needs its own ids.
//
// The regression these pin cost five duplicate ids in this repo's own worked deck. `artNamespace`
// hashes content, so two inserts of one drawing hashed identically — and `render-ids.test.js`
// asserts across the engine that a rendered document has no duplicate id, because a duplicate makes
// every `url(#…)` resolve to the first one.

import { describe, expect, it } from 'vitest';
import type { Scene } from '@/lib/anima';
import { mintNamespace, PROCESSED_ATTR, reinstance } from './instance';

const spec = (refs: string[]): Scene =>
	({ source: 'svg', asset: 'drawing', duration: 900, hero: 1, elements: refs.map((r) => ({ id: r, pathRef: r, motion: [{ verb: 'draw', at: 0, span: 1 }] })) }) as unknown as Scene;

/** Both fields an svg element addresses its drawing through. */
const refsOf = (sc: Scene) => (sc as unknown as { elements: { id: string; pathRef: string }[] }).elements;

describe('reinstance — every insert is a copy', () => {
	const art = `<svg viewBox="0 0 10 10" ${PROCESSED_ATTR}="mabc"><defs><clipPath id="mabc-clip"><rect width="4" height="4"/></clipPath></defs><rect id="mabc-box" clip-path="url(#mabc-clip)" width="4" height="4"/><path id="mabc-arrow" d="M0 0 H9"/></svg>`;

	it('gives two copies of one drawing disjoint id sets', () => {
		const a = reinstance(art, spec(['mabc-box', 'mabc-arrow']));
		const b = reinstance(art, spec(['mabc-box', 'mabc-arrow']));
		const ids = (m: string) => new Set(Array.from(m.matchAll(/\sid="([^"]+)"/g), (x) => x[1]));
		const A = ids(a.art);
		const B = ids(b.art);
		expect(A.size).toBe(3);
		for (const id of B) expect(A.has(id)).toBe(false);
	});

	it('moves the plan with the ids, so the copy stays addressable', () => {
		const out = reinstance(art, spec(['mabc-box', 'mabc-arrow']));
		const ns = out.art.match(new RegExp(`${PROCESSED_ATTR}="([^"]+)"`))?.[1];
		expect(ns).toBeTruthy();
		expect(refsOf(out.spec).map((e) => e.pathRef)).toEqual([`${ns}-box`, `${ns}-arrow`]);
		// `id` moves with `pathRef` — a half-remapped element still validates, which is the trap.
		expect(refsOf(out.spec).map((e) => e.id)).toEqual([`${ns}-box`, `${ns}-arrow`]);
		for (const e of refsOf(out.spec)) expect(out.art).toContain(`id="${e.pathRef}"`);
	});

	it('rewrites internal references, so a clip path does not reach across to the other copy', () => {
		const out = reinstance(art, spec(['mabc-box']));
		const ns = out.art.match(new RegExp(`${PROCESSED_ATTR}="([^"]+)"`))?.[1];
		expect(out.art).toContain(`url(#${ns}-clip)`);
		expect(out.art).not.toContain('url(#mabc-clip)');
	});

	it('leaves unstamped art alone rather than desynchronizing it from a plan it cannot read', () => {
		const bare = '<svg viewBox="0 0 10 10"><rect id="box" width="4" height="4"/></svg>';
		const s = spec(['box']);
		const out = reinstance(bare, s);
		expect(out.art).toBe(bare);
		expect(out.spec).toBe(s);
	});

	it('mints namespaces that collide only by accident, not by construction', () => {
		const minted = new Set(Array.from({ length: 2000 }, () => mintNamespace()));
		expect(minted.size).toBe(2000);
		expect(mintNamespace()).toMatch(/^m[a-z0-9]{8}$/);
	});
});
