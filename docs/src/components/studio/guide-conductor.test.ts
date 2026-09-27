import { describe, expect, it } from 'vitest';
import { createGuideConductor, type GuideDelivery, type GuideStage } from './guide-conductor';
import type { GuideCue } from './present-guide';

// The per-sentence rules Present and the exported player share (guide-conductor.ts). The host's
// `aim` / `cue` are stubbed from a text → element table, so these pin the RULES — rest, pause and
// resume, hold, hide — not the resolver, which present-guide.test.ts covers.

const delivery = (over: Partial<GuideDelivery> = {}): GuideDelivery => ({
	name: 'restrained',
	budget: 2,
	floor: 0,
	ink: 'none',
	dim: 0.45,
	dimInner: 0.3,
	fade: 200,
	hold: 'none',
	wordFocus: true,
	strength: 'quiet',
	...over,
});

function setup() {
	document.body.innerHTML = '<section data-lattice-slide="1"><ul><li id="a">Revenue grew.</li><li id="b">Churn fell.</li><li id="c">Hiring held.</li></ul></section>';
	const el = (id: string) => document.getElementById(id) as Element;
	const table: Record<string, Element> = { 'Revenue grew.': el('a'), 'Revenue grew a lot.': el('a'), 'Churn fell.': el('b'), 'Hiring held.': el('c') };
	const gestures: string[] = [];
	let visible = false;
	const stage: GuideStage = {
		gesture: async (kind) => {
			gestures.push(kind);
		},
		setCursorVisible: (v) => {
			visible = v;
		},
	};
	const cue = (t: string): GuideCue | null => {
		const e = table[t];
		if (!e) return null;
		const box = { getBoundingClientRect: () => e.getBoundingClientRect(), getClientRects: () => [] };
		return { el: e, kind: 'underline', strength: 'quiet', target: box, rest: null };
	};
	const g = createGuideConductor({ stage: () => stage, aim: (t) => table[t] ?? null, cue, clearance: 19 });
	const focused = () => [...document.querySelectorAll('li')].filter((li) => !li.classList.contains('lat-guide-dim')).map((li) => li.id);
	return { g, gestures, focused, isVisible: () => visible };
}

const texts = ['Revenue grew.', 'Revenue grew a lot.', 'Churn fell.', 'A long line of commentary the slide does not carry at all.', 'Thank you.'];
const beat = (g: ReturnType<typeof setup>['g'], cue: number, delivering = true, d = delivery()) => g.beat({ slide: 0, cue, texts, track: texts, delivering, delivery: d });

describe('guide-conductor — the per-sentence rules', () => {
	it('focuses the named element and recedes its peers', () => {
		const { g, focused } = setup();
		beat(g, 0);
		expect(focused()).toEqual(['a']);
	});

	it('rests on a sentence that names the element already focused', () => {
		const { g, focused } = setup();
		beat(g, 0);
		const aimed = g.aimed();
		beat(g, 1);
		expect(g.aimed()).toBe(aimed);
		expect(focused()).toEqual(['a']);
	});

	it('moves to the next planned block', () => {
		const { g, focused } = setup();
		beat(g, 0);
		beat(g, 2);
		expect(focused()).toEqual(['b']);
	});

	// Paused on the block's SECOND sentence: the plan gestures only on the first, so without the
	// remembered focus the rest of the block would play bare.
	it('lifts the focus on pause and brings it back on play, without a new stroke', () => {
		const { g, focused, gestures } = setup();
		beat(g, 0);
		beat(g, 1);
		beat(g, 1, false);
		expect(focused()).toEqual(['a', 'b', 'c']);
		beat(g, 1, true);
		expect(focused()).toEqual(['a']);
		expect(gestures).toEqual([]); // restrained draws no ink on a focusable bullet
	});

	it('keeps the paused focus through a reset, as Present did when its stage was rebuilt', () => {
		const { g, focused } = setup();
		beat(g, 0);
		beat(g, 1);
		beat(g, 1, false);
		g.reset();
		beat(g, 1, true);
		expect(focused()).toEqual(['a']);
	});

	it('takes the focus down on commentary the slide does not carry', () => {
		const { g, focused } = setup();
		beat(g, 2);
		beat(g, 3);
		expect(focused()).toEqual(['a', 'b', 'c']);
		expect(g.aimed()).toBeNull();
	});

	it('holds through an aside under a preset that holds, and not under one that does not', () => {
		const held = setup();
		beat(held.g, 2, true, delivery({ hold: 'aside' }));
		beat(held.g, 4, true, delivery({ hold: 'aside' }));
		expect(held.focused()).toEqual(['b']);
		const released = setup();
		beat(released.g, 2);
		beat(released.g, 4);
		expect(released.focused()).toEqual(['a', 'b', 'c']);
	});
});
