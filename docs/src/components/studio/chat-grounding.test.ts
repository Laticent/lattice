// P2b — the chat-grounding seam (2026-07-03-studio-succession.md §2.3).
//
// The succession plan names two silent failures this port can land, and both are
// tested here rather than left to review:
//
//   1. The user's INSTRUCTIONS vanish. `withStudioVoice` merges the language directive
//      + standing instructions into a *string* system turn; grounding splits that turn
//      into content-parts first, so a naive port drops the voice on the floor.
//   2. The user's MONEY burns. The static prefix (persona + canon + ~17K-token primer)
//      must stay byte-identical turn to turn so the cache breakpoint lands after it.
//      Appending the live assessment to that prefix would re-write the whole thing to
//      cache every turn at the 1.25x write premium, with zero hits.
import { beforeEach, describe, expect, it } from 'vitest';
import { withCachedSystem } from './ai/or-cache.js';
import { readCachingEnabled } from './ai/spend.js';
import { buildChatSystem, withStudioVoice } from './architect';

const FINDINGS = [
	{ message: 'Slide opens without a title', slide: 2 },
	{ message: 'Body prose exceeds the density budget', slide: 5 },
];
const SCORECARD = { craft: { score: 94, band: 'A', summary: 'no issues found' }, style: { score: 82, band: 'B+', summary: 'a few small things' }, profile: { key: 'teaching', label: 'Teaching', blurb: '', origin: 'declared', declaredInvalid: null }, categories: [] };
// Shaped like the payload `studio.astro` actually ships — every field `layoutBlock`
// reads, so a payload that drops one fails here instead of silently thinning the prompt.
const CATALOG = [
	{
		name: 'actors',
		bucket: 'inventory',
		summary: 'Roster of responsibilities owned by named actors.',
		description: 'Roster of responsibilities owned by named actors.',
		skeleton: '<!-- _class: actors -->\n\n## Title\n\n- Row',
		variants: ['compact'],
		capacity: { axis: 'item', soft: 6, hard: 7 },
		density: { soft: 14 },
		slots: [
			{ name: 'title', required: true, description: 'Slide heading.' },
			{ name: 'rows', required: true, description: 'One row per responsibility.' },
		],
		variantSkeletons: [{ name: 'compact', caption: 'tighter rows', sample: '<!-- _class: actors compact -->\n\n## Title\n\n1. Name `value`' }],
	},
];

describe('buildChatSystem — the static/dynamic split', () => {
	it('puts the assessment in the DYNAMIC tail, never the cacheable prefix', () => {
		const { staticPrefix, dynamicTail } = buildChatSystem('openrouter', { scorecard: SCORECARD, findings: FINDINGS });
		// BOTH grades ride the tail, each named for what it measures, and the style score
		// never travels without the profile it was measured against — a bare number would
		// let the model narrate genre fit as a verdict on the deck.
		expect(dynamicTail).toContain('Craft (genre-blind authoring quality): A (94/100)');
		expect(dynamicTail).toContain('Style (fit against the Teaching profile, declared): B+ (82/100)');
		// JSON-quoted on purpose: the message quotes the author's deck, and the deck can be
		// untrusted. The quoting is the containment, so pin it rather than the bare text.
		expect(dynamicTail).toContain('"Slide opens without a title" (slide 2)');
		// The whole point: the volatile half must not touch the cached half.
		expect(staticPrefix).not.toContain('87');
		expect(staticPrefix).not.toContain('Slide opens without a title');
	});

	it('keeps the static prefix byte-identical as the assessment changes', () => {
		const a = buildChatSystem('openrouter', { scorecard: SCORECARD, findings: FINDINGS });
		const b = buildChatSystem('openrouter', { scorecard: { craft: { score: 62, band: 'C', summary: 'a lot to fix' }, style: { score: 70, band: 'B', summary: 'several things to fix' }, profile: { key: 'boardroom', label: 'Boardroom', blurb: '', origin: 'inferred', declaredInvalid: null }, categories: [] }, findings: [{ message: 'Something else entirely' }] });
		// Cache hits on turns 2..N depend on this exact equality.
		expect(b.staticPrefix).toBe(a.staticPrefix);
		expect(b.dynamicTail).not.toBe(a.dynamicTail);
	});

	it('grounds the cloud tier in the Lattice primer, and spares on-device models', () => {
		const cloud = buildChatSystem('openrouter', { catalog: CATALOG });
		const local = buildChatSystem('webllm', { catalog: CATALOG });
		expect(cloud.staticPrefix).toContain('actors');
		// A 17K-token primer makes a small on-device model lose the thread.
		expect(local.staticPrefix).not.toContain('You know Lattice, the Markdown slide engine');
	});

	// The primer is built from the payload `studio.astro` ships. Asserting only that a
	// layout NAME appears passes on a payload carrying nothing else — which is exactly
	// what shipped: `summary`, `slots`, `capacity` and `variantSkeletons` all reached
	// `layoutBlock` as undefined, so the model got 61 names and no authoring contract.
	// These pin the four fields by their rendered shape, not by the fixture's own keys.
	it('carries the authoring contract, not just the layout names', () => {
		const { staticPrefix } = buildChatSystem('openrouter', { catalog: CATALOG });
		expect(staticPrefix).toContain('### actors — Roster of responsibilities owned by named actors.');
		expect(staticPrefix).toContain('- `rows`: One row per responsibility.');
		expect(staticPrefix).toContain('Budget: ≤ 6 items');
		// AUTHORING_RULES tells the model to match a variant's OWN skeleton where one is
		// shown; without this the instruction points at content that is never emitted.
		expect(staticPrefix).toContain('is authored differently');
	});

	it('reports "no mechanical issues" rather than silently omitting the section', () => {
		const { dynamicTail } = buildChatSystem('openrouter', { scorecard: null, findings: [] });
		expect(dynamicTail).toContain('No mechanical issues found.');
	});

	it('carries a per-turn constraint in the dynamic tail', () => {
		const guard = '\n\nCONSTRAINT — FACTS LOCKED: do not change numbers.';
		const { staticPrefix, dynamicTail } = buildChatSystem('openrouter', { findings: [] }, guard);
		expect(dynamicTail).toContain('FACTS LOCKED');
		expect(staticPrefix).not.toContain('FACTS LOCKED');
	});

	it('degrades to the pre-grounding prompt when the caller passes nothing', () => {
		const { staticPrefix, dynamicTail } = buildChatSystem('openrouter');
		expect(staticPrefix).toContain('Converse with the author');
		expect(dynamicTail).toBe('');
	});
});

describe('the split turn still carries the Studio voice (failure mode 1)', () => {
	it('appends the voice AFTER a pre-split content-part system turn', () => {
		const { staticPrefix, dynamicTail } = buildChatSystem('openrouter', { scorecard: SCORECARD, findings: FINDINGS });
		const msgs = withStudioVoice(
			[
				{
					role: 'system',
					content: [
						{ type: 'text', text: staticPrefix },
						{ type: 'text', text: dynamicTail },
					],
				},
				{ role: 'user', content: 'tighten slide 2' },
			],
			'openrouter',
			'en-GB',
		);
		const sys = msgs.find((m) => m.role === 'system');
		expect(Array.isArray(sys?.content)).toBe(true);
		const parts = sys?.content as { text: string }[];
		// Three parts: cached prefix, volatile assessment, volatile voice — and the voice
		// (the language directive) is genuinely present, not dropped by the string guard.
		expect(parts).toHaveLength(3);
		expect(parts[2].text).toContain('Write all natural-language prose');
		expect(parts[2].text).toContain('United Kingdom');
	});
});

describe('the cache breakpoint lands after the static prefix (failure mode 2)', () => {
	it('marks only the first part, leaving the assessment and voice uncached', () => {
		const { staticPrefix, dynamicTail } = buildChatSystem('openrouter', { scorecard: SCORECARD, findings: FINDINGS });
		const marked = withCachedSystem(
			[
				{
					role: 'system',
					content: [
						{ type: 'text', text: staticPrefix },
						{ type: 'text', text: dynamicTail },
					],
				},
				{ role: 'user', content: 'hi' },
			],
			'anthropic/claude-3.5-sonnet',
		);
		const parts = marked[0].content as { text: string; cache_control?: unknown }[];
		expect(parts[0].cache_control).toEqual({ type: 'ephemeral' });
		expect(parts[1].cache_control).toBeUndefined();
	});

	// The chat asks for a 1-hour breakpoint rather than the provider's 5-minute default.
	// A conversation has think-gaps; at the 5m default the ~17K-token prefix is re-written
	// after every lull, which is most turns. Ported with its cost reasoning from the
	// Drawing Board's chat, where it was explicit — and dropped silently in the first port,
	// because the test that pinned it was deleted along with its subject.
	it('gives the chat prefix a 1-hour TTL, not the 5-minute default', () => {
		const marked = withCachedSystem(
			[
				{ role: 'system', content: [{ type: 'text', text: 'PREFIX' }, { type: 'text', text: 'TAIL' }] },
				{ role: 'user', content: 'hi' },
			],
			'anthropic/claude-3.5-sonnet',
			'1h',
		);
		const parts = marked[0].content as { cache_control?: unknown }[];
		expect(parts[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
		expect(parts[1].cache_control).toBeUndefined();
	});
});

describe('the caching opt-out is honored', () => {
	beforeEach(() => localStorage.clear());

	it('defaults to on, and reads the author’s opt-out', () => {
		// The setting was written by the settings panel but never read by the model layer
		// before P2b — the toggle was inert. The OpenRouter path now consults this per turn.
		expect(readCachingEnabled()).toBe(true);
		localStorage.setItem('lattice-db-or-cache', 'off');
		expect(readCachingEnabled()).toBe(false);
		localStorage.setItem('lattice-db-or-cache', 'on');
		expect(readCachingEnabled()).toBe(true);
	});
});
