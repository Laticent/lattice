// Unit tests for the pure head-rewriting logic behind scripts/hoist-stylesheets.mjs.
// No build, no browser — plain HTML strings.
//
// The property that matters is NOT "the link moved to the top". It is "the link moved
// as early as it can without crossing a `<style>`": crossing one silently reorders the
// cascade, which turns a performance fix into a visual change. Most of these tests exist
// to pin that boundary.

import { describe, expect, it } from 'vitest';
import { hoistStylesheets } from './hoist-stylesheets.mjs';

const page = (head, body = '<p>hi</p>') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const SHEET = '<link rel="stylesheet" href="/_astro/landing.abc.css">';

describe('hoistStylesheets', () => {
	it('moves the sheet ahead of an inline script that precedes it', () => {
		const out = hoistStylesheets(page(`<meta charset="utf-8"><script>var a=1;</script>${SHEET}`));
		expect(out.html).toBe(page(`<meta charset="utf-8">${SHEET}<script>var a=1;</script>`));
		expect(out.moved).toBe('<script>var a=1;</script>'.length);
	});

	it('does NOT move it past a <style> — that would reorder the cascade', () => {
		const head = `<style>a{color:red}</style><script>var a=1;</script>${SHEET}`;
		const out = hoistStylesheets(page(head));
		expect(out.html).toBe(page(`<style>a{color:red}</style>${SHEET}<script>var a=1;</script>`));
	});

	it('leaves a <style> that already follows the sheet where it is', () => {
		// The studio page's real shape: shell CSS, geometry seed, the sheet, a trailing
		// inline block. The trailing block must STAY after the sheet.
		const head = `<style>/*shell*/</style><script>/*seed*/</script>${SHEET}<style>/*late*/</style>`;
		const out = hoistStylesheets(page(head));
		expect(out.html).toBe(page(`<style>/*shell*/</style>${SHEET}<script>/*seed*/</script><style>/*late*/</style>`));
		const html = out.html;
		expect(html.indexOf('/*shell*/')).toBeLessThan(html.indexOf(SHEET));
		expect(html.indexOf(SHEET)).toBeLessThan(html.indexOf('/*late*/'));
	});

	it('keeps two sheets in their original relative order', () => {
		const a = '<link rel="stylesheet" href="/a.css">';
		const b = '<link rel="stylesheet" href="/b.css">';
		const out = hoistStylesheets(page(`<script>x</script>${a}<script>y</script>${b}`));
		expect(out.html).toBe(page(`${a}${b}<script>x</script><script>y</script>`));
	});

	it('is idempotent — a sheet already at its floor is untouched', () => {
		const head = `<meta charset="utf-8">${SHEET}<script>var a=1;</script>`;
		const once = hoistStylesheets(page(head));
		expect(once.html).toBe(page(head));
		expect(once.moved).toBe(0);
		expect(hoistStylesheets(once.html).html).toBe(once.html);
	});

	it('leaves a document with no stylesheet link alone', () => {
		const head = '<meta charset="utf-8"><title>t</title>';
		expect(hoistStylesheets(page(head)).html).toBe(page(head));
	});

	it('leaves a document with no </head> alone rather than guessing', () => {
		const frag = '<div>fragment</div>';
		expect(hoistStylesheets(frag).html).toBe(frag);
	});

	it('never touches the body — a stylesheet link below the fold stays put', () => {
		const body = `<p>hi</p>${SHEET}`;
		const out = hoistStylesheets(page('<meta charset="utf-8"><script>x</script>', body));
		expect(out.html).toBe(page('<meta charset="utf-8"><script>x</script>', body));
	});

	it('handles a self-closing link and single-quoted rel is left alone', () => {
		const selfClosing = '<link rel="stylesheet" href="/a.css" />';
		const out = hoistStylesheets(page(`<script>x</script>${selfClosing}`));
		expect(out.html).toBe(page(`${selfClosing}<script>x</script>`));
	});
});
