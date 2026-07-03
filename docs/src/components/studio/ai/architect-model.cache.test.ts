import { describe, expect, it } from 'vitest';
import { orSupportsCache, withCachedSystem } from './architect-model.js';

// Prompt caching (#610): mark the static SYSTEM prefix with a `cache_control`
// breakpoint so a repeated, byte-identical system prompt (our ~7K-token authoring
// canon) is read at ~0.1x on calls 2..N instead of re-billed at full input price.
// These lock the PURE message-shaping contract; the live cache HIT is observed
// against the real API (a budget-gated manual smoke), not here.

const SYS = { role: 'system', content: 'BIG STATIC CANON …' };
const USER = { role: 'user', content: 'a grid of cards' };
const NEIGHBORS = { role: 'assistant', content: 'near-neighbors: capability-cards' };

describe('architect-model — prompt-cache breakpoint (#610)', () => {
	it('marks the system block for vendors that need an explicit breakpoint (anthropic/google)', () => {
		for (const id of ['anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro']) {
			const out = withCachedSystem([SYS, USER], id);
			expect(Array.isArray(out[0].content)).toBe(true);
			expect(out[0].content).toEqual([{ type: 'text', text: SYS.content, cache_control: { type: 'ephemeral' } }]);
			// the user turn is untouched — it varies, so it stays OUTSIDE the cached prefix
			expect(out[1]).toEqual(USER);
		}
	});

	it('leaves auto-caching vendors (openai/deepseek/x-ai) untouched — plain string content', () => {
		for (const id of ['openai/gpt-5', 'deepseek/deepseek-r1', 'x-ai/grok-4']) {
			const out = withCachedSystem([SYS, USER], id);
			expect(out).toEqual([SYS, USER]);
			expect(typeof out[0].content).toBe('string');
		}
	});

	it('marks ONLY the first system message (a per-request dedup-neighbor block stays uncached)', () => {
		const out = withCachedSystem([SYS, NEIGHBORS, USER], 'anthropic/claude-sonnet-4.5');
		expect(Array.isArray(out[0].content)).toBe(true);
		expect(out[1]).toEqual(NEIGHBORS); // assistant neighbors: untouched
		expect(out[2]).toEqual(USER);
	});

	it('is a no-op when there is no system message, and is pure (inputs untouched)', () => {
		const input = [USER];
		const out = withCachedSystem(input, 'anthropic/claude-sonnet-4.5');
		expect(out).toEqual([USER]);
		expect(typeof SYS.content).toBe('string'); // the shared SYS literal was never mutated
		expect(input[0]).toBe(USER);
	});

	it('tolerates junk input (null model, empty list) without throwing', () => {
		expect(withCachedSystem([SYS, USER], '')).toEqual([SYS, USER]);
		expect(withCachedSystem([], 'anthropic/x')).toEqual([]);
		expect(withCachedSystem(undefined as never, 'anthropic/x')).toEqual([]);
	});

	it('the breakpoint vendor set is a subset of the cache-capable vendor set', () => {
		// every vendor we mark must be one OpenRouter reports as cache-capable
		for (const id of ['anthropic/x', 'google/x']) expect(orSupportsCache(id)).toBe(true);
	});
});
