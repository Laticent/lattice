// @vitest-environment jsdom
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WalkBar } from './WalkBar';

const base = { index: 0, count: 0, onPrev() {}, onNext() {}, nextLabel: null, prevDisabled: true, nextDisabled: true, notice: null };

describe('WalkBar caption in the server HTML', () => {
	it('carries the baked caption and marks it, so the page has text to paint before the plan lands', () => {
		const html = renderToString(<WalkBar {...base} caption="Roster of responsibilities." baked />);
		expect(html).toMatch(/<p class="pg-walk-caption" data-baked="" [^>]*>Roster of responsibilities\.<\/p>/);
	});
	it('marks nothing once a real caption has replaced it', () => {
		const html = renderToString(<WalkBar {...base} caption="Roster of responsibilities." />);
		expect(html).not.toContain('data-baked');
	});
});
