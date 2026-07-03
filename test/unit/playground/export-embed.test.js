/**
 * Unit: drawing-board-export.js — embedThemeInMarkdown, the pure kernel of the
 * Workbench export bridge (engineering/decisions/2026-06-11-workbench-export-
 * bridge.md). Proves a library theme's CSS is embedded self-contained while the
 * deck's `theme:` directive is preserved, and that built-in / themeless exports
 * pass through untouched.
 *
 * DOM-free function → tested directly; the export wiring (Blob/download) lives in
 * drawing-board-export.js + drawing-board.astro and is verified interactively.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
	return import('../../../docs/src/components/studio/export/deck-export.js');
}

const THEME_CSS = "/* @theme mine */\n@import 'lattice';\n:where(:root){color-scheme:light}\n:root{--accent:#246;}";
const DECK = '---\nmarp: true\ntheme: mine\n---\n\n# Hello\n\nBody.\n';

describe('embedThemeInMarkdown', () => {
	test('no theme → source returned unchanged', async () => {
		const { embedThemeInMarkdown } = await load();
		assert.equal(embedThemeInMarkdown(DECK, null), DECK);
		assert.equal(embedThemeInMarkdown(DECK, undefined), DECK);
		assert.equal(embedThemeInMarkdown(DECK, { name: 'x', css: '' }), DECK);
	});

	test('library theme → CSS embedded in a <style> block, after the front matter', async () => {
		const { embedThemeInMarkdown } = await load();
		const out = embedThemeInMarkdown(DECK, { name: 'mine', css: THEME_CSS });
		assert.match(out, /<style>/);
		assert.match(out, /<\/style>/);
		assert.ok(out.includes(THEME_CSS.trim()), 'embeds the saved CSS verbatim');
		// The directive is preserved (a re-import resolves the theme by name).
		assert.match(out, /^---[\s\S]*theme: mine[\s\S]*?---/);
		// The <style> sits after the front matter, before the first slide content.
		const fmEnd = out.indexOf('---', 3) + 3;
		assert.ok(out.indexOf('<style>') > fmEnd, '<style> follows the front matter');
		assert.ok(out.indexOf('<style>') < out.indexOf('# Hello'), '<style> precedes the body');
	});

	test('names the embedded theme in a provenance comment', async () => {
		const { embedThemeInMarkdown } = await load();
		const out = embedThemeInMarkdown(DECK, { name: 'editorial', css: THEME_CSS });
		assert.match(out, /embedded theme "editorial"/);
	});

	test('no front matter → block prepended at the top', async () => {
		const { embedThemeInMarkdown } = await load();
		const out = embedThemeInMarkdown('# Bare\n', { name: 'mine', css: THEME_CSS });
		assert.ok(out.trimStart().startsWith('<style>'), 'block leads the document');
		assert.ok(out.includes('# Bare'));
	});

	test('handles empty / non-string source defensively', async () => {
		const { embedThemeInMarkdown } = await load();
		assert.equal(embedThemeInMarkdown('', null), '');
		assert.equal(embedThemeInMarkdown(undefined, null), '');
	});
});
