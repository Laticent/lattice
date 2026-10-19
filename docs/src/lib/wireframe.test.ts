// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { __clearWireframeMemo, wireframeOf } from './wireframe';

describe('wireframeOf', () => {
	beforeEach(() => __clearWireframeMemo());

	it('reads a title, then text, in document order', () => {
		const w = wireframeOf('<section><h2>Headline</h2><p>Some words that make a short paragraph.</p></section>');
		expect(w.blocks.map((b) => b.k)).toEqual(['title', 'text']);
		expect(w.empty).toBe(false);
	});

	it('counts list items, capped, and makes a chart of an svg and a block of code', () => {
		const items = Array.from({ length: 9 }, (_, i) => `<li>item ${i}</li>`).join('');
		const w = wireframeOf(`<section><h2>t</h2><ul>${items}</ul><svg></svg><pre>a\nb\nc</pre></section>`);
		expect(w.blocks).toEqual([{ k: 'title' }, { k: 'list', n: 5 }, { k: 'chart' }, { k: 'code', n: 3 }]);
	});

	it('draws a table by its rows, a picture as media and a quote as a bar', () => {
		const w = wireframeOf('<section><table><tr><td>a</td></tr><tr><td>b</td></tr></table><img src="x"><blockquote>q</blockquote></section>');
		expect(w.blocks).toEqual([{ k: 'table', rows: 2 }, { k: 'media' }, { k: 'quote' }]);
	});

	it('lets a block claim its subtree, so a list does not also count its paragraphs', () => {
		const w = wireframeOf('<section><ul><li><p>inner text here</p></li></ul></section>');
		expect(w.blocks).toEqual([{ k: 'list', n: 1 }]);
	});

	it('skips the engine chrome: the marker rail, the footer and aria-hidden decoration', () => {
		const w = wireframeOf('<section><h2>t</h2><div class="marker-rail"><p>tab</p></div><div class="cell-footer"><p>foot</p></div><div aria-hidden="true"><svg></svg></div></section>');
		expect(w.blocks).toEqual([{ k: 'title' }]);
	});

	it('is empty for a slide with nothing to draw, and never exceeds six blocks', () => {
		expect(wireframeOf('<section></section>').empty).toBe(true);
		const many = Array.from({ length: 12 }, () => '<p>some text here</p>').join('');
		expect(wireframeOf(`<section>${many}</section>`).blocks).toHaveLength(6);
	});

	it('reads a list of cards (items with a bold lead or their own sub-list) as a grid, not bullets', () => {
		const w = wireframeOf('<section><ol><li><strong>4</strong><ul><li>tiles</li></ul></li><li><strong>5s</strong><ul><li>scan</li></ul></li></ol></section>');
		expect(w.blocks).toEqual([{ k: 'cards', n: 2 }]);
	});

	it('labels a slide by its component class, skipping the generic ones', () => {
		expect(wireframeOf('<section data-class="kpi attention" class="kpi attention form"><h2>t</h2></section>').label).toBe('kpi');
		expect(wireframeOf('<section class="form silent title"><h2>t</h2></section>').label).toBe('title');
	});

	it('memoizes by markup', () => {
		const html = '<section><h2>x</h2></section>';
		expect(wireframeOf(html)).toBe(wireframeOf(html));
	});
});
