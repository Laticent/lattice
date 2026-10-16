// The fence door's style rule (lib/core/door-attr.mjs `doorFinishFence` / `fenceStyle`), through the real slide
// sanitizer the Studio's door builds (door-run.ts `doorSanitizer`). A fence draws a figure, so its output keeps its
// layout styles, but never one that places a box by the viewport: the red team on #2687 covered the whole slide with
// `position:fixed;inset:0`. The root's CSS contains its paint too; plugin-fence-ui.spec.ts drives that half.

import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { doorFinishFence, fenceStyle } from '../../../../lib/core/door-attr.mjs';
import { createSlideSanitizer } from '../../../../lib/core/sanitize-slide-html.mjs';

const sanitize = (() => {
	let current: unknown = () => false;
	const s = createSlideSanitizer(DOMPurify, window, { filterAttr: (t: string, n: string, v: string) => (current as (a: string, b: string, c: string) => boolean | string)(t, n, v) });
	return (html: string, filter?: unknown) => {
		current = filter ?? (() => false);
		try {
			return s(html);
		} finally {
			current = () => false;
		}
	};
})();
const finish = (html: string) => doorFinishFence(document, sanitize, html, 'lp-gantt-plugin') as { html: string } | { error: string };
const html = (h: string) => (finish(h) as { html: string }).html;

describe('doorFinishFence — no box placed by the viewport', () => {
	it('drops a fixed position, keeping the rest of the declaration list', () => {
		expect(html('<div style="position:fixed;inset:0;z-index:9;background:red">x</div>')).toBe('<div style="inset:0;z-index:9;background:red">x</div>');
		expect(html('<div style="position: sticky; top: 0">x</div>')).toBe('<div style="top:0">x</div>');
	});

	it('drops a length in any viewport unit', () => {
		for (const unit of ['vw', 'vh', 'vmin', 'vmax', 'dvh', 'svw', 'lvb', 'vi']) {
			expect(html(`<div style="width:100${unit};color:red">x</div>`), unit).toBe('<div style="color:red">x</div>');
		}
	});

	it('sees through a comment and refuses an escape that could spell a property or a unit', () => {
		expect(html('<div style="position/**/:fixed;color:red">x</div>')).toBe('<div style="color:red">x</div>');
		expect(html('<div style="posit\\69 on:fixed;color:red">x</div>')).toBe('<div style="color:red">x</div>');
		expect(html('<div style="width:1\\76 w;color:red">x</div>')).toBe('<div style="color:red">x</div>');
	});

	it('reads a line break in a string as CSS does, so no declaration hides inside a kept value (the checker)', () => {
		const out = html('<div style="font-family:&quot;a&#10;;position:fixed;inset:0">x</div>');
		expect(out).not.toMatch(/position/);
	});

	it('drops a viewport length written with an exponent', () => {
		expect(html('<div style="width:1e2vw;height:1E2vh;color:red">x</div>')).toBe('<div style="color:red">x</div>');
		expect(html('<div style="width:+.5e1vw;color:red">x</div>')).toBe('<div style="color:red">x</div>');
	});

	it('drops a popover, which opens in the top layer outside any containment', () => {
		const out = html('<button popovertarget="lp-gantt-plugin-p">open</button><div popover="manual" id="lp-gantt-plugin-p">big</div>');
		expect(out).not.toMatch(/popover/);
	});

	it('drops the attributes that open a modal dialog over the page with no script', () => {
		const out = html('<dialog id="lp-gantt-plugin-d">d</dialog><button commandfor="lp-gantt-plugin-d" command="show-modal">b</button>');
		expect(out).not.toMatch(/command/);
	});

	it('reads an unquoted url( to its first `)`, as the browser does, so nothing hides after a bad one', () => {
		for (const style of ["background:url(data:image/gif;base64,R0lGOD'lh);position:fixed;inset:0;color:'x", 'background:url(data:image/gif;base64,R0lGOD(lh);position:fixed;inset:0;x:)']) {
			const out = html(`<div style="${style.replace(/'/g, '&#39;')}">x</div>`);
			expect(out, style).not.toMatch(/position/);
			expect(out, style).not.toMatch(/R0lGOD/);
		}
		// A good unquoted url keeps its declaration and the ones after it.
		expect(fenceStyle('background:url(data:image/png;base64,AAAA);position:fixed;color:red')).toBe('background:url(data:image/png;base64,AAAA);color:red');
	});

	it('leaves a figure that never placed by the viewport byte for byte', () => {
		const grid = '<div style="display:grid; grid-template-columns: 1fr 2fr; position: relative"><span style="position:absolute; left:10%; top:0">a</span></div>';
		expect(html(grid)).toBe(grid);
		// A `;` inside a data: URL is part of the value, not the end of the declaration.
		const img = '<div style="background:url(data:image/png;base64,AAAA) center / cover;height:4em">x</div>';
		expect(html(img)).toBe(img);
	});

	it('removes a style left with nothing in it', () => {
		expect(html('<div style="position:fixed">x</div>')).toBe('<div>x</div>');
	});
});

describe('fenceStyle', () => {
	it('keeps static, relative and absolute positions', () => {
		for (const p of ['static', 'relative', 'absolute']) expect(fenceStyle(`position:${p}`)).toBe(`position:${p}`);
	});
	it('fails closed on a position it cannot read', () => {
		expect(fenceStyle('position:fixed !important;color:red')).toBe('color:red');
	});
});
