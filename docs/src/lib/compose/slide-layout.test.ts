// @vitest-environment jsdom
// The layout of a whole slide, as Compose's layout button changes it (slide-layout.ts;
// engineering/decisions/2026-11-15-compose-layout-button.md). jsdom, because the fit test serializes
// the slide's body through the schema's own `toDOM` and queries the grammar's selectors, as the pane
// gallery's does (pane-gallery.test.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckToDoc, emitDeck, initBaseline } from './deck-doc';
import { paneNeedsFrom } from './pane-needs';
import { applySlideLayout, layoutBlocker, restoreSlide, slideBodyRange, slideComponent, slideFit, slideStarter } from './slide-layout';

const DIST = join(__dirname, '../../../../dist/docs');
const grammar = JSON.parse(readFileSync(join(DIST, 'grammar.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(DIST, 'components.json'), 'utf8'));
const NEEDS = paneNeedsFrom(grammar.components, Object.fromEntries(catalog.components.map((c: { name: string; substance?: string }) => [c.name, c.substance || ''])));
const SKELETON: Record<string, string> = Object.fromEntries(grammar.components.map((c: { name: string; skeleton: string }) => [c.name, c.skeleton]));

const STATS = ['<!-- _class: stats -->', '', '`Pilot results`', '', '## By the numbers.', '', '1. 80', '   - components', '2. 12', '   - themes', '', '> Small set, wide reach.', ''].join('\n');
const PLAIN = ['<!-- _class: content -->', '', '## Why now.', '', '- Costs fell', '- Demand rose', ''].join('\n');

const stateOf = (src: string) => EditorState.create({ doc: deckToDoc(src) });
const emit = (state: EditorState, src: EditorState) => emitDeck(state.doc, initBaseline(src.doc));

describe('a slide body is what its layout draws: the heading block and the coda stay the slide’s own', () => {
	it('skips the eyebrow, the heading and a closing Key Insight', () => {
		const slide = stateOf(STATS).doc.child(0);
		const { from, to } = slideBodyRange(slide);
		const body = [];
		for (let k = from; k < to; k++) body.push(slide.child(k).type.name);
		expect(body).toEqual(['ordered_list']);
		expect(slideComponent(slide)).toBe('stats');
	});

	it('reads a slide with no class as `content`', () => {
		expect(slideComponent(stateOf('## Hello\n\n- one\n').doc.child(0))).toBe('content');
	});
});

describe('a change of layout keeps the text when the new layout can read it, and says so when it cannot', () => {
	it('a list of figures fits a metric layout; a plain list does not fit a chart', () => {
		const fitStats = slideFit(stateOf(STATS).doc.child(0), NEEDS, document);
		expect(fitStats('big-number')).toBe('keeps');
		const fitPlain = slideFit(stateOf(PLAIN).doc.child(0), NEEDS, document);
		expect(fitPlain('stats')).toBe('fresh');
	});
});

describe('applySlideLayout writes one class line and nothing else, unless it is told to start from an example', () => {
	it('relabels the slide and keeps every byte of its text', () => {
		const state = stateOf(STATS);
		const tr = applySlideLayout(state, 0, { tokens: ['big-number'], starter: null });
		expect(tr).not.toBeNull();
		const out = emit(state.apply(tr!), state);
		expect(out).toBe(STATS.replace('<!-- _class: stats -->', '<!-- _class: big-number -->'));
	});

	it('swaps the body for a starter and keeps the eyebrow, the heading and the Key Insight', () => {
		const state = stateOf(STATS);
		const starter = slideStarter(SKELETON['list-steps'], false);
		const tr = applySlideLayout(state, 0, { tokens: ['list-steps'], starter });
		const out = emit(state.apply(tr!), state);
		expect(out).toContain('<!-- _class: list-steps -->');
		expect(out).toContain('`Pilot results`');
		expect(out).toContain('## By the numbers.');
		expect(out).toContain('> Small set, wide reach.');
		expect(out).not.toContain('   - components');
	});

	it('does nothing to a slide that already has that layout, a locked slide, or a compound class comment', () => {
		expect(applySlideLayout(stateOf(STATS), 0, { tokens: ['stats'], starter: null })).toBeNull();
		// Strikethrough is a construct Compose cannot round-trip, so the slide is edited in Source.
		const locked = stateOf('<!-- _class: stats -->\n\n## Gone\n\n~~struck~~\n');
		expect(locked.doc.child(0).attrs.locked).toBe(true);
		expect(applySlideLayout(locked, 0, { tokens: ['big-number'], starter: null })).toBeNull();
		const src = '<!-- _class: stats\n_paginate: false -->\n\n## By the numbers.\n\n1. 80\n   - components\n';
		const compound = stateOf(src);
		// A class comment that also holds `_paginate` is not Compose's to rewrite: the change would drop the other key.
		expect(applySlideLayout(compound, 0, { tokens: ['big-number'], starter: null })).toBeNull();
		// …and the button says so rather than doing nothing.
		expect(layoutBlocker(compound.doc.child(0))).toMatch(/shares a comment/);
		expect(layoutBlocker(locked.doc.child(0))).toMatch(/edited in Source/);
		expect(layoutBlocker(stateOf(STATS).doc.child(0))).toBeNull();
		expect(src).toContain('_paginate: false');
	});

	it('restoreSlide puts the slide back byte for byte, however many changes the visit made', () => {
		const state = stateOf(STATS);
		const original = state.doc.child(0);
		let s = state.apply(applySlideLayout(state, 0, { tokens: ['big-number'], starter: null })!);
		s = s.apply(applySlideLayout(s, 0, { tokens: ['list-steps'], starter: slideStarter(SKELETON['list-steps'], false) })!);
		const back = restoreSlide(s, 0, original);
		expect(back).not.toBeNull();
		expect(emit(s.apply(back!), state)).toBe(STATS);
		expect(restoreSlide(state, 0, original)).toBeNull();
	});
});
