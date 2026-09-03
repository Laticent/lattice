import { describe, expect, it } from 'vitest';
import { getFrontMatter } from '@/components/studio/front-matter';
import { deckAnimatesCharts, deckPlaysMotion, sourceAnimatesCharts } from '../../../lib/core/resolve-motion.mjs';
import { parseDeckMotion } from './anima-host-sel';

// ── ONE QUESTION, ONE ANSWER ─────────────────────────────────────────────────────────
//
// "Does this deck animate a chart?" had THREE readers and they disagreed three ways, all
// three silent, all three measured on real exports:
//
//   · `motion: On`            — animated live, exported a STILL (case-sensitive compare)
//   · `<!-- _class: … chart-anima -->` — animated live, exported a STILL (legacy alias missed)
//   · `<!-- _class: … motion-build -->` — never moved, but shipped 22,845 bytes of player
//
// The export-time reader and the Studio panel now share `lib/core/resolve-motion.mjs`, and
// this pins that shared reader against the RUNTIME cascade in `anima-host-sel.ts`, which
// stays canonical. The two answer different questions — "ship the bundle?" vs "mount this
// section?" — so they cannot be the same function, which is exactly why they need a gate.
//
// PLAY IS THE SOLE SWITCH: style/speed tokens are parameters, `motion-off` is the opt-out.

const deck = (fm: string, cls = 'funnel') => `---\nmarp: true\ntheme: indaco\n${fm}---\n\n<!-- _class: ${cls} -->\n\n## F\n\n- A \`1\`\n`;
const rendered = (cls: string) => `<section class="${cls} form chart-frame"><svg><polygon data-anima-role="bar"/></svg></section>`;

describe('deck-level Play agrees with parseDeckMotion', () => {
	for (const raw of ['on', 'On', 'ON', ' on ', "'on'", '"on"', 'off', 'Off', '', 'yes', 'true']) {
		it(`agrees on ${JSON.stringify(raw)}`, () => {
			// Compare against the live surface's REAL composition, not `parseDeckMotion` alone:
			// PlaygroundApp and DeckPreview both call `parseDeckMotion(getFrontMatter(src, …))`,
			// and `getFrontMatter` is what unquotes. Handing the raw quoted scalar straight to
			// `parseDeckMotion` measures a call the app never makes — the first version of this
			// test did exactly that and reported a divergence on `'on'` that does not exist.
			const src = deck(`motion: ${raw}\n`);
			expect(deckPlaysMotion(src)).toBe(parseDeckMotion(getFrontMatter(src, 'motion')).play === 'on');
		});
	}

	it('treats an absent key as off, on both sides', () => {
		expect(deckPlaysMotion(deck(''))).toBe(false);
		expect(parseDeckMotion(null).play === 'on').toBe(false);
	});
});

describe('per-slide Play tokens', () => {
	// The runtime's own list, restated as data so a change to one side shows up here.
	const OPTS_IN = ['motion-on', 'chart-anima'];
	const DOES_NOT = ['motion-build', 'motion-together', 'motion-rise', 'motion-slow', 'motion-fast', 'motion-off'];

	for (const cls of OPTS_IN) {
		it(`${cls} opts a class-less deck in`, () => {
			expect(deckAnimatesCharts(deck('', `funnel ${cls}`), rendered(`funnel ${cls}`))).toBe(true);
			expect(sourceAnimatesCharts(deck('', `funnel ${cls}`))).toBe(true);
		});
	}

	for (const cls of DOES_NOT) {
		it(`${cls} does NOT, because Play is the sole switch`, () => {
			expect(deckAnimatesCharts(deck('', `funnel ${cls}`), rendered(`funnel ${cls}`))).toBe(false);
			expect(sourceAnimatesCharts(deck('', `funnel ${cls}`))).toBe(false);
		});
	}
});

describe('a deck that only DOCUMENTS the tokens does not ship a player', () => {
	it('ignores a fenced code block', () => {
		// Markdown escapes `<` to `&lt;` inside a fence, so the rendered HTML never carries a
		// real `<section class="… motion-on">` — the check keys on the element tag for exactly
		// this reason.
		const docHtml = '<pre><code>&lt;!-- _class: funnel motion-on --&gt;</code></pre>';
		expect(deckAnimatesCharts(deck(''), docHtml)).toBe(false);
	});
});
