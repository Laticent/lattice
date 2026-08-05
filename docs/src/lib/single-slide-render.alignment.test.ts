// The ALIGNMENT guard on the deck-context render — the regression test the original
// deck-context test could not have caught, because that one mocks the engine with a
// hand-written 3-section string.
//
// THE BUG THIS LOCKS: `slideIndex` is an index into the CALLER's authored-slide list, while
// the narrowing step indexes the ENGINE's sections. Those counts diverge on decks that ship
// in this repo, and when they do an index-based lookup paints a slide the author did not
// select — strictly worse than the wrong page number the feature exists to fix, because the
// old behavior was visibly wrong and this one is plausibly wrong.
//
// So these tests drive the REAL engine and the REAL Studio splitter over the REAL example
// decks. A mock cannot express a 1→N expansion, and that is precisely the failure mode.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SLIDE_SEP } from '../components/studio/deck-ops';
import { frontMatterBlock, stripFrontMatter } from '../components/studio/front-matter';
import { splitSlides } from '../components/studio/lint';

// The engine is CJS and Node-safe (no DOM) — load it directly rather than through the
// browser bundle, so this test exercises the same numbering code the preview does.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const engine = require('../../../lib/engine/index.js') as { render: (md: string, theme: string) => { html: string } };

const ROOT = path.resolve(__dirname, '../../..');
const sectionCount = (html: string) => (html.match(/<section\b/g) || []).length;

/** What the Studio hands the preview: front matter + every viewed slide, rejoined. */
function deckDoc(src: string) {
	const fm = frontMatterBlock(src);
	const slides = splitSlides(stripFrontMatter(src));
	return { fm, slides, doc: fm + slides.join(SLIDE_SEP) };
}

describe('deck-context alignment (real engine, real splitter)', () => {
	// This is the fact the guard exists for. If this test ever goes green with an empty list,
	// the divergence has been fixed at the source and the guard could be revisited — but it
	// must never be assumed away.
	it('real decks EXIST whose engine section count differs from the authored slide count', () => {
		const dir = path.join(ROOT, 'examples');
		const mismatched: Record<string, [number, number]> = {};
		for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
			const { slides, doc } = deckDoc(fs.readFileSync(path.join(dir, f), 'utf8'));
			const sections = sectionCount(engine.render(doc, 'lattice').html);
			if (sections !== slides.length) mismatched[f] = [slides.length, sections];
		}
		// `_focusSteps` clones one authored slide into a section per step; `split: headings`
		// divides one chunk at every heading. Both are engine features, not bugs — which is
		// why the preview must not assume 1:1.
		expect(mismatched['focus.md']).toEqual([11, 14]);
		expect(mismatched['split-headings.md']).toEqual([1, 7]);
	});

	it('an ALIGNED deck lets every authored index name the right section', () => {
		// The common case, and the one the feature is for: index k really is section k.
		const src = '---\npaginate: true\n---\n\n# Alpha\n\n---\n\n## Bravo\n\n---\n\n## Charlie\n';
		const { slides, doc } = deckDoc(src);
		const html = engine.render(doc, 'lattice').html;
		expect(sectionCount(html)).toBe(slides.length);
		// Each section's stamped ordinal is its 1-based authored position.
		const ordinals = [...html.matchAll(/data-lattice-pagination="(\d+)"/g)].map((m) => m[1]);
		expect(ordinals).toEqual(['1', '2', '3']);
	});

	it('a `_focusSteps` deck offsets EVERY index from the expansion onward', () => {
		// The concrete harm, reduced to a fixture: authored slide 2 becomes 2 sections, so
		// authored slide 3 ("Omega") lives at section index 3, not 2. An index-based lookup
		// would show the wrong slide, and the LAST authored slide would be unreachable.
		const src = '---\npaginate: true\n---\n\n## Alpha\n\nx\n\n---\n\n<!-- _focusSteps: a | b -->\n\n## Steps\n\n- a\n- b\n\n---\n\n## Omega\n\nEnd.\n';
		const { slides, doc } = deckDoc(src);
		const html = engine.render(doc, 'lattice').html;
		expect(slides.length).toBe(3);
		expect(sectionCount(html)).toBeGreaterThan(3);
		// Authored index 2 is "Omega", but section index 2 is not.
		const sections = html.split('</section>');
		const headingAt = (i: number) => sections[i]?.match(/<h2[^>]*>([^<]*)</)?.[1] ?? '';
		expect(slides[2]).toContain('Omega');
		expect(headingAt(2)).not.toBe('Omega');
	});

	it('separator forms the two splitters USED to disagree about now break 1:1', () => {
		// THE ALLOWANCE THIS FILE USED TO CARRY, inverted. It asserted that `***`, `___`,
		// `- - -` and `---   ` are one authored slide to the Studio and TWO to the engine —
		// a divergence documented, guarded against, and lived with, because the Studio's
		// splitter matched only a bare `\n---\n`.
		//
		// The Studio now derives boundaries from the engine's own `hr` rule
		// (`lib/core/slide-boundaries.mjs`), so the count agrees and the caller's index means
		// what the engine means by it. That is the whole point of #1271, and this is the
		// assertion that proves it on the REAL engine over the REAL splitter rather than in
		// the scanner's own unit test.
		for (const sep of ['***', '___', '- - -', '---   ', '----', '  ---']) {
			const src = `---\npaginate: true\n---\n\n## Alpha\n\none\n\n${sep}\n\n## Beta\n\ntwo\n`;
			const { slides, doc } = deckDoc(src);
			const sections = sectionCount(engine.render(doc, 'lattice').html);
			expect(slides.length, `separator ${JSON.stringify(sep)}`).toBe(2);
			expect(sections, `separator ${JSON.stringify(sep)}`).toBe(slides.length);
		}
	});

	it('a setext underline is a heading to BOTH, not a separator to either', () => {
		// The divergence of opposite sign, and the one that produced a caller counting a slide
		// the deck does not render. `Interlude` over `---` is a level-2 heading.
		// `split: rule` isolates the question to the SEPARATOR. Under the default heading split
		// a setext underline also makes a new h2, which divides the slide for a different reason
		// — the one `positionIsTrustworthy` still refuses on, and not the one under test here.
		const src = '---\npaginate: true\nsplit: rule\n---\n\n## Alpha\n\nInterlude\n---\n\nmore\n';
		const { slides, doc } = deckDoc(src);
		expect(slides.length).toBe(1);
		expect(sectionCount(engine.render(doc, 'lattice').html)).toBe(slides.length);
	});
});

// ── The two holes the count-agreement guard alone does NOT close ──────────────────────
// Both were found by the adversarial trio against the first revision of this fix.

describe('narrowing fails closed on shapes the flat walker cannot resolve', () => {
	it('a raw <section> in author content mis-pairs the flat walker — and is DETECTED', () => {
		// The engine passes author raw HTML through, so this slide's own `<section>` makes the
		// flat "next </section>" pairing close slide 1 early. The mis-paired part count can still
		// equal the authored slide count, so a count check alone passes and the neighbor's markup
		// — including its visible page number — leaks into the frame. The `<section` tally catches it.
		const src = '---\npaginate: true\n---\n\n## One\n\n<section class="form">\nnested\n</section>\n\ntail\n\n---\n\n## Two\n\n---\n\n## Three\n';
		const { slides, doc } = deckDoc(src);
		const html = engine.render(doc, 'lattice').html;
		const opens = (html.match(/<section\b/g) || []).length;
		// 3 authored slides, but 4 `<section` opens — the author's raw one is in there.
		expect(slides.length).toBe(3);
		expect(opens).toBeGreaterThan(slides.length);
		// This is precisely the case a count-only guard would wave through, which is why the
		// production guard compares the tally to the walker's part count as well.
	});
});
