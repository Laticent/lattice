import { describe, expect, it } from 'vitest';
import { buildSrcdoc, SCAN_SHELL } from './deck-preview.js';

// The Playground's style loader scans a document it builds itself (docs/src/lib/style-loader.ts):
// SCAN_SHELL's `open` stands in for the `<html>` that `buildSrcdoc` writes. If `buildSrcdoc` grows an
// `<html>` attribute or a `<body>` attribute that SCAN_SHELL lacks, a lattice.css rule keyed on it
// would stop loading, with no error. This pins the two together.
const base = { css: 'section{}', mode: 'light' as const, geom: { w: 1280, h: 720 }, runtimeUrl: '/rt.js' };
const html = '<section id="1"><h1>Hi</h1></section>';

const attrNames = (tag: string) => [...tag.matchAll(/\s([a-zA-Z-]+)(?==|\s|>)/g)].map((m) => m[1].toLowerCase());
const openTag = (doc: string, name: string) => doc.match(new RegExp(`<${name}\\b[^>]*>`, 'i'))?.[0] ?? '';

describe('SCAN_SHELL', () => {
	const shellHtmlAttrs = new Set(attrNames(openTag(SCAN_SHELL.open, 'html')));

	it('names every attribute buildSrcdoc puts on <html>, under every option that adds one', () => {
		for (const opts of [{}, { previewFonts: true }, { diagrams: true, deck: { katex: false, drawn: true, dagre: false, blocked: [] } }, { previewFonts: true, diagrams: true, deck: { katex: false, drawn: true, dagre: false, blocked: [] } }]) {
			const written = attrNames(openTag(buildSrcdoc({ ...base, html, ...opts }), 'html'));
			for (const a of written) expect(shellHtmlAttrs.has(a), `<html ${a}> is written by buildSrcdoc but missing from SCAN_SHELL.open`).toBe(true);
		}
	});

	it('leaves <body> bare, as buildSrcdoc does', () => {
		expect(attrNames(openTag(buildSrcdoc({ ...base, html }), 'body'))).toEqual([]);
		expect(attrNames(openTag(SCAN_SHELL.open, 'body'))).toEqual([]);
	});

	it('prefixes the same texture defs buildSrcdoc puts before the slides', () => {
		const doc = buildSrcdoc({ ...base, html });
		expect(SCAN_SHELL.prefix.length).toBeGreaterThan(0);
		expect(doc).toContain(SCAN_SHELL.prefix);
	});
});
