/**
 * Unit: the Studio's welcome deck (`docs/src/components/studio/decks.ts`,
 * `DECKS[0]`) states counts about the engine — and it is the deck the LANDING
 * PAGE points every visitor at ("This is the deck the Studio opens on"), so a
 * stale number here is a stale number on the conversion path.
 *
 * It had exactly that defect: the "What's in the box" slide read `53
 * components` while the engine shipped 61. Nothing caught it, because the deck
 * is a hand-written string and the catalog is generated — two sources of truth
 * with no link between them. This test is that link.
 *
 * The counts policy (2026-07-02-website-copy-positioning.md §7.3) says an exact
 * count may appear only where it is generated from the manifests. This deck
 * can't generate one — it's a static module the client imports — so the number
 * stays hand-written and this test holds it to the live catalog instead.
 *
 * If this fails: update the number in `decks.ts` to the live count. Do NOT
 * relax the assertion — the whole point is that the two cannot drift apart.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DECKS_TS = path.join(__dirname, '..', '..', '..', 'docs', 'src', 'components', 'studio', 'decks.ts');

/** The deck is TypeScript the CommonJS test runner can't import — read it as text. */
const source = fs.readFileSync(DECKS_TS, 'utf8');

describe('studio welcome deck — stated counts', () => {
	test('the "components" stat matches the live manifest catalog', () => {
		// The stats slide is authored as `1. <n>\n   - components`, escaped inside a
		// template literal, so the separator on disk is the two-character `\n`.
		const hit = source.match(/(\d+)\\n\s*-\s*components/);
		assert.ok(hit, 'could not find the "<n> components" stat in decks.ts — did the slide change shape?');

		const { loadAll } = require('../../../lib/components/index.js');
		const live = loadAll().length;

		assert.equal(
			Number(hit[1]),
			live,
			`the welcome deck says ${hit[1]} components but the engine ships ${live}. ` +
				'The landing page points visitors at this deck, so update the number in ' +
				'docs/src/components/studio/decks.ts.',
		);
	});

	test('carries none of the retired auto-generation vocabulary', () => {
		// §5.13 / §7.1: the positioning is AGAINST auto-generation. This deck used
		// to say "composes itself", "designs itself" and "instantly" — the exact
		// register the copy review retired everywhere else on the site.
		const banned = /designs itself|builds itself|assembles itself|composes itself|\binstantly\b|\bmagic\b/gi;
		const found = source.match(banned);
		assert.equal(
			found,
			null,
			`retired auto-generation vocabulary in the Studio's demo decks: ${found ? found.join(', ') : ''}. ` +
				'The engine does the composing — say so with the engine as the actor.',
		);
	});
});
