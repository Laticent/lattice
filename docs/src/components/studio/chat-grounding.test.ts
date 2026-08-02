// P2b — the chat-grounding seam (2026-07-03-studio-succession.md §2.3).
//
// The succession plan names two silent failures this port can land, and both are
// tested here rather than left to review:
//
//   1. The user's INSTRUCTIONS vanish. `withStudioVoice` merges the language directive
//      + standing instructions into a *string* system turn; grounding splits that turn
//      into content-parts first, so a naive port drops the voice on the floor.
//   2. The user's MONEY burns. The static prefix (persona + canon + ~10K-token primer)
//      must stay byte-identical turn to turn so the cache breakpoint lands after it.
//      Appending the live assessment to that prefix would re-write the whole thing to
//      cache every turn at the 1.25x write premium, with zero hits.
import { beforeEach, describe, expect, it } from 'vitest';
import { withCachedSystem } from './ai/architect-model.js';
import { readCachingEnabled } from './ai/spend.js';
import { buildChatSystem, withStudioVoice } from './architect';

const FINDINGS = [
	{ message: 'Slide opens without a title', slide: 2 },
	{ message: 'Body prose exceeds the density budget', slide: 5 },
];
const SCORECARD = { overall: 87, band: 'A−' };

describe('buildChatSystem — the static/dynamic split', () => {
	it('puts the assessment in the DYNAMIC tail, never the cacheable prefix', () => {
		const { staticPrefix, dynamicTail } = buildChatSystem('openrouter', { scorecard: SCORECARD, findings: FINDINGS });
		expect(dynamicTail).toContain('A− (87/100)');
		expect(dynamicTail).toContain('Slide opens without a title (slide 2)');
		// The whole point: the volatile half must not touch the cached half.
		expect(staticPrefix).not.toContain('87');
		expect(staticPrefix).not.toContain('Slide opens without a title');
	});

	it('keeps the static prefix byte-identical as the assessment changes', () => {
		const a = buildChatSystem('openrouter', { scorecard: SCORECARD, findings: FINDINGS });
		const b = buildChatSystem('openrouter', { scorecard: { overall: 62, band: 'C' }, findings: [{ message: 'Something else entirely' }] });
		// Cache hits on turns 2..N depend on this exact equality.
		expect(b.staticPrefix).toBe(a.staticPrefix);
		expect(b.dynamicTail).not.toBe(a.dynamicTail);
	});

	it('grounds the cloud tier in the Lattice primer, and spares on-device models', () => {
		const catalog = [{ name: 'headline', bucket: 'anchor', description: 'A cover statement.' }];
		const cloud = buildChatSystem('openrouter', { catalog });
		const local = buildChatSystem('webllm', { catalog });
		expect(cloud.staticPrefix).toContain('headline');
		// A 10K-token primer makes a small on-device model lose the thread.
		expect(local.staticPrefix).not.toContain('You know Lattice, the Markdown slide engine');
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
